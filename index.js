const mqtt = require('mqtt');

module.exports = (api) => {
  api.registerAccessory('RozcomDoor', RozcomDoorAccessory);
};

class RozcomDoorAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.name = config.name || 'Front Door';
    this.mqttHost = config.mqttHost || '62.219.14.161';
    this.mqttPort = config.mqttPort || 1883;
    this.topic = config.topic;
    this.payload = config.payload;

    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.lockService = new this.Service.LockMechanism(this.name);

    this.lockService.getCharacteristic(this.Characteristic.LockCurrentState)
      .onGet(() => this.Characteristic.LockCurrentState.SECURED);

    this.lockService.getCharacteristic(this.Characteristic.LockTargetState)
      .onSet(this.setLockTargetState.bind(this))
      .onGet(() => this.Characteristic.LockTargetState.SECURED);
  }

  async setLockTargetState(value) {
    if (value !== this.Characteristic.LockTargetState.UNSECURED) return;

    const client = mqtt.connect(`mqtt://${this.mqttHost}:${this.mqttPort}`, {
      clientId: 'CocoaMQTT-' + Math.floor(Math.random() * 100000),
    });

    client.on('connect', () => {
      this.log('Connected to MQTT broker, publishing door open command');
      client.publish(this.topic, this.payload, {}, (err) => {
        if (err) this.log.error('Publish failed:', err);
        else this.log('Door open command sent');
        client.end();
      });
    });

    client.on('error', (err) => {
      this.log.error('MQTT connection error:', err);
      client.end();
    });

    this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, this.Characteristic.LockCurrentState.UNSECURED);
    setTimeout(() => {
      this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, this.Characteristic.LockCurrentState.SECURED);
      this.lockService.updateCharacteristic(this.Characteristic.LockTargetState, this.Characteristic.LockTargetState.SECURED);
    }, 2000);
  }

  getServices() {
    return [this.lockService];
  }
}
