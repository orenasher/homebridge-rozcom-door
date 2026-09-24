# homebridge-rozcom-door

Homebridge plugin exposing a Rozcom Smart Intercom building entrance door as a HomeKit Lock accessory, opened via MQTT.

## Configuration

Add to your Homebridge config.json accessories array:

    accessory: RozcomDoor
    name: Front Door
    mqttHost: your-broker-ip
    mqttPort: 1883
    topic: Intercom/BUILDING_ID/startcall
    payload: openDoor1:CODE

Find your broker, topic and payload values by capturing the Rozcom app's MQTT traffic (e.g. with mitmproxy in transparent mode).
