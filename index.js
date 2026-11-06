const mqtt = require('mqtt');

const PLUGIN_NAME = 'homebridge-rozcom-door';
const ALIAS = 'RozcomDoor';
const DEFAULT_HOST = '62.219.14.161';
const DEFAULT_PORT = 1883;
const DEFAULT_UNLOCK_SECONDS = 2;
const CONNECT_TIMEOUT_MS = 8000;

const brokers = new Map();

module.exports = (api) => {
  // The platform is the way to set the plugin up from now on.
  api.registerPlatform(PLUGIN_NAME, ALIAS, RozcomDoorPlatform);
  // Older setups still list the door under "accessories"; keep them working.
  api.registerAccessory(PLUGIN_NAME, ALIAS, RozcomDoorAccessory);
  api.on('shutdown', () => {
    for (const broker of brokers.values()) broker.close();
    brokers.clear();
  });
};

const text = (value) => (typeof value === 'string' ? value.trim() : value);

function doorSettings(config) {
  const seconds = Number(config.unlockSeconds);
  return {
    name: text(config.name) || 'Front Door',
    mqttHost: text(config.mqttHost) || DEFAULT_HOST,
    mqttPort: Number(config.mqttPort) || DEFAULT_PORT,
    topic: text(config.topic),
    payload: text(config.payload),
    unlockSeconds: seconds >= 1 && seconds <= 30 ? seconds : DEFAULT_UNLOCK_SECONDS,
  };
}

// Identifies a door by its topic and command ("openDoor1"), not by the code,
// so changing the code later does not create a new accessory in Apple Home.
function doorId(settings) {
  const command = String(settings.payload).split(':')[0];
  return `${settings.topic}:${command}`;
}

// One shared, long-lived connection per MQTT broker.
class Broker {
  constructor(log, host, port) {
    this.log = log;
    this.url = `mqtt://${host}:${port}`;
    this.client = null;
    this.offline = false;
  }

  ensure() {
    if (this.client) return this.client;
    const client = mqtt.connect(this.url, {
      clientId: 'CocoaMQTT-' + Math.floor(Math.random() * 100000),
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectPeriod: 5000,
      keepalive: 30,
    });
    client.on('connect', () => {
      if (this.offline) this.log('MQTT broker is reachable again');
      this.offline = false;
    });
    client.on('error', (err) => {
      if (!this.offline) this.log.warn(`MQTT broker is not reachable: ${err.message || err}`);
      this.offline = true;
    });
    this.client = client;
    return client;
  }

  // Resolves once the message was handed to the broker. Rejects if the broker is not
  // reachable in time. The message is never queued, so a door can't open late by itself.
  publish(topic, payload) {
    const client = this.ensure();
    return new Promise((resolve, reject) => {
      let done = false;
      const send = () => {
        client.publish(topic, payload, { qos: 0 }, (err) => finish(err));
      };
      const finish = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        client.removeListener('connect', send);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(
        () => finish(new Error('timed out waiting for the MQTT broker')),
        CONNECT_TIMEOUT_MS,
      );
      if (client.connected) send();
      else client.once('connect', send);
    });
  }

  close() {
    if (this.client) this.client.end(true);
    this.client = null;
  }
}

function getBroker(log, host, port) {
  const key = `${host}:${port}`;
  if (!brokers.has(key)) brokers.set(key, new Broker(log, host, port));
  return brokers.get(key);
}

// Wires a HomeKit lock to one Rozcom door.
class Door {
  constructor(log, api, settings, service) {
    this.log = log;
    this.api = api;
    this.settings = settings;
    this.service = service;
    this.timer = null;
    const { Characteristic } = api.hap;

    service.setCharacteristic(Characteristic.Name, settings.name);
    service.getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => Characteristic.LockCurrentState.SECURED);
    service.getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => Characteristic.LockTargetState.SECURED)
      .onSet((value) => this.setTarget(value));
  }

  async setTarget(value) {
    const { Characteristic, HapStatusError, HAPStatus } = this.api.hap;
    if (value !== Characteristic.LockTargetState.UNSECURED) return;
    const { name, mqttHost, mqttPort, topic, payload, unlockSeconds } = this.settings;

    try {
      if (!topic || !payload) throw new Error('topic and payload are not set');
      await getBroker(this.log, mqttHost, mqttPort).publish(topic, payload);
      this.log(`${name}: door open command sent`);
    } catch (err) {
      this.log.error(`${name}: could not open the door: ${err.message || err}`);
      // Shows "No Response" in Apple Home instead of pretending it worked.
      throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    this.service.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.service.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
      this.service.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
    }, unlockSeconds * 1000);
  }
}

class RozcomDoorPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    this.config = config || {};
    this.cached = new Map();
    api.on('didFinishLaunching', () => {
      try {
        this.setUp();
      } catch (err) {
        this.log.error('Could not set up the doors:', err.message || err);
      }
    });
  }

  configureAccessory(accessory) {
    this.cached.set(accessory.UUID, accessory);
  }

  doors() {
    const list = Array.isArray(this.config.doors) ? [...this.config.doors] : [];
    // A door written straight into the platform block (like the old accessory setup).
    if (this.config.topic && this.config.payload) list.unshift(this.config);
    return list.filter((d) => d && d.topic && d.payload).map(doorSettings);
  }

  setUp() {
    const { api } = this;
    const { Service } = api.hap;
    const keep = new Set();
    const doors = this.doors();
    if (!doors.length) this.log.warn('No door is set up yet. Add a door with its topic and payload in the plugin settings.');

    for (const settings of doors) {
      const uuid = api.hap.uuid.generate(`${PLUGIN_NAME}:${doorId(settings)}`);
      if (keep.has(uuid)) {
        this.log.warn(`${settings.name}: another door already uses the same topic and command, skipping it`);
        continue;
      }
      keep.add(uuid);
      let accessory = this.cached.get(uuid);
      const isNew = !accessory;
      if (isNew) accessory = new api.platformAccessory(settings.name, uuid);
      accessory.displayName = settings.name;
      accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(api.hap.Characteristic.Manufacturer, 'Rozcom')
        .setCharacteristic(api.hap.Characteristic.Model, 'Smart Intercom');
      const service = accessory.getService(Service.LockMechanism) || accessory.addService(Service.LockMechanism, settings.name);
      new Door(this.log, api, settings, service);
      if (isNew) {
        api.registerPlatformAccessories(PLUGIN_NAME, ALIAS, [accessory]);
        this.log(`Added door: ${settings.name}`);
      } else {
        api.updatePlatformAccessories([accessory]);
      }
    }

    const stale = [...this.cached.values()].filter((a) => !keep.has(a.UUID));
    if (stale.length) api.unregisterPlatformAccessories(PLUGIN_NAME, ALIAS, stale);
  }
}

class RozcomDoorAccessory {
  constructor(log, config, api) {
    const settings = doorSettings(config || {});
    log.warn(`${settings.name} is set up under "accessories". It still works, but new setups should use the plugin settings (platform). See the README before moving it, because Apple Home will see a new lock.`);
    this.service = new api.hap.Service.LockMechanism(settings.name);
    new Door(log, api, settings, this.service);
  }

  getServices() {
    return [this.service];
  }
}
