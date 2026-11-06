const mqtt = require('mqtt');

const PLUGIN_NAME = 'homebridge-rozcom-door';
const ALIAS = 'RozcomDoor';
const DEFAULT_HOST = '62.219.14.161';
const DEFAULT_PORT = 1883;

module.exports = (api) => {
  // The platform is the way to set the plugin up from now on.
  api.registerPlatform(PLUGIN_NAME, ALIAS, RozcomDoorPlatform);
  // Older setups still list the door under "accessories"; keep them working.
  api.registerAccessory(PLUGIN_NAME, ALIAS, RozcomDoorAccessory);
};

function doorSettings(config) {
  return {
    name: config.name || 'Front Door',
    mqttHost: config.mqttHost || DEFAULT_HOST,
    mqttPort: Number(config.mqttPort) || DEFAULT_PORT,
    topic: config.topic,
    payload: config.payload,
  };
}

// Wires a HomeKit lock to one Rozcom door.
class Door {
  constructor(log, api, settings, service) {
    this.log = log;
    this.settings = settings;
    this.Characteristic = api.hap.Characteristic;
    this.service = service;
    const { Characteristic } = this;

    service.setCharacteristic(Characteristic.Name, settings.name);
    service.getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => Characteristic.LockCurrentState.SECURED);
    service.getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => Characteristic.LockTargetState.SECURED)
      .onSet((value) => this.setTarget(value));
  }

  setTarget(value) {
    const { Characteristic } = this;
    if (value !== Characteristic.LockTargetState.UNSECURED) return;
    this.open();
    this.service.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED);
    setTimeout(() => {
      this.service.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
      this.service.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
    }, 2000);
  }

  open() {
    const { name, mqttHost, mqttPort, topic, payload } = this.settings;
    if (!topic || !payload) {
      this.log.warn(`${name}: topic and payload are not set, so the door can't be opened`);
      return;
    }
    let client;
    try {
      client = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`, {
        clientId: 'CocoaMQTT-' + Math.floor(Math.random() * 100000),
        connectTimeout: 10000,
        reconnectPeriod: 0,
      });
    } catch (err) {
      this.log.error(`${name}: could not connect to the MQTT broker:`, err.message || err);
      return;
    }
    client.on('connect', () => {
      this.log(`${name}: connected to MQTT broker, publishing door open command`);
      client.publish(topic, payload, {}, (err) => {
        if (err) this.log.error(`${name}: publish failed:`, err.message || err);
        else this.log(`${name}: door open command sent`);
        client.end();
      });
    });
    client.on('error', (err) => {
      this.log.error(`${name}: MQTT connection error:`, err.message || err);
      client.end(true);
    });
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
      const uuid = api.hap.uuid.generate(`${PLUGIN_NAME}:${settings.topic}:${settings.payload}`);
      if (keep.has(uuid)) continue;
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
    this.service = new api.hap.Service.LockMechanism(settings.name);
    new Door(log, api, settings, this.service);
  }

  getServices() {
    return [this.service];
  }
}
