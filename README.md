# Homebridge MQTT Blinds with simulation

Homebridge plugin to control blinds via MQTT with simulation mode.

## Installation

1. install homebridge
   `npm install -g homebridge`
2. install this plugin
   `npm install -g homebridge-mqtt-blinds-simulation`
3. update your `~/.homebridge/config.json` file (use `sample-config.json` as a reference)

## Configuration

Sample accessory:

```
"accessories": [
  {
    "accessory": "Blinds",
    "name": "Kitchen",
    "topicUp": {
        "url": "",
        "message": ""
    },
    "topicDown": {
    "url": "",
    "message": ""
    },
    "topicStop": {
    "url": "",
    "message": ""
    },
    "durationUp": 27000,
    "durationDown": 25000,
    "durationOffset": 1000,
    "mqttUrl": "mqtt://localhost:1883",
    "mqttUser": "",
    "mqttPass": ""
   }
]
```

Fields:

- `accessory` must always be _Blinds_
- `name` room with blinds, e.g. _Garage_
- `topicUp` topic object for send up message
- `topicDown` topic object for send down message
- `topicStop` topic object for send stop message
- `durationUp` milliseconds to open blinds completely
- `durationDown` milliseconds to close blinds completely
- `durationOffset` [optional, default: *0*] milliseconds added to durationUp and durationDown to make sure that blinds are completely open or closed
- `mqttUrl` URL of your MQTT server
- `mqttUser` [optional] username of your MQTT server
- `mqttPass` [optional] password of your MQTT server
