# homebridge-domotiga

[![npm version](https://badge.fury.io/js/homebridge-domotiga.svg)](https://badge.fury.io/js/homebridge-domotiga)
[![Dependency Status](https://gemnasium.com/badges/github.com/Samfox2/homebridge-domotiga.svg)](https://gemnasium.com/github.com/Samfox2/homebridge-domotiga)

Supports [Domotiga](https://domotiga.nl) devices on [HomeBridge](https://github.com/nfarina/homebridge) platform.


Older version using API 1.0: [homebridge-domotiga-1.0](https://github.com/Samfox2/homebridge-domotiga-1.0) (deprecated)

### Switching from homebridge-domotiga (API 1.0)
Users switching from homebridge-domotiga will need to remove their old config in `config.json` and use the new config. Hence, DomotiGa will show up as brand new device. This is due to the fact that API 2.0 only supports platform plugins and homebridge-domotiga was implemented as an accessory plugin. This means any configurations, alarms, scenes, etc to which the devices were associated will need to be updated with the new DomotiGa devices.


### What this plugin does

The latest version (work in progress) supports following (primary) services:

- ```TemperatureSensor``` (temperature)
- ```HumiditySensor``` (humidity)
- ```AirQualitySensor``` (air quality)
- ```FakeEveAirQualitySensor``` (custom Eve service, same as AirQualitySensor with additional ppm value in Eve app)
- ```FakeEveWeatherSensor``` (custom Eve service with airpressure in Eve app)
- ```Contact``` (contact state)
- ```LeakSensor``` (leaksensor state)
- ```MotionSensor``` (motionsensor state)
- ```Switch``` (get/set switch state)
- ```Outlet``` (get/set outlet state)
- ```Door``` (get/set door position)
- ```Window``` (get/set window position)
- ```WindowCovering``` (get/set window covering positon)
- ```Lightbulb``` (switch on/of lightbulbs, change color and brightness)
- ```Powermeter``` (custom service with power consumption)

Domotiga device value numbers (e.g. which device value represents temperature) can be assigned directly within the config.json file. For multi-sensors (e.g. combined temperature/humidity sensors) additional characteristics can be added by defining their domotiga values in config.json (see example below).

# Supported Backend ###
The plugin supports various backends for getting or setting sensor data:

- ```URL endpoint``` URL endpoint (communication with TCP backend )
- ```Command execution```	Communication by calling executables for getting/setting state/data
- ```File endpoint```	Communication by reading/writing to a file

The used backend can be configured globally or individually for each accessory. It's not possible at the moment, to configure more
then one backend presently. If you have

## URL endpoints
To use URL endpoints your configuration file needs a the following option in platform or accessory block:
{
	"endpoint": "http://localhost:9000/apiv1"
}
Requests will be send in http body by using JSONRPC 2.0 protocol, e.g:
{"jsonrpc":"2.0","method":"device.get","id":1,"params":{"device_id":"14","valuenum":"temperature2"}}

Responses needs the following structure:
{
	"jsonrpc" : "2.0",
	"id": 23,
	"result": {
		"values": {
			"temperature2": {
				"value": 23.0
			}
		}
	}
}

Please be aware, that the backend need to fullfil JSONRPC specification, especially in error cases! Otherwise it will be really
hard for you to debug your communication!

## Command endpoints
The plugin allows you to get/set information or states by calling a command. To use that, you have to add the configuration option command": "/path/to/executable" to platform or accessory block. Make sure you have the right flags (executable bit) set.

Calling a binary or a script allows you to define placeholders, that will be passed to the command. ZThe following placeholders are supported:
- $device (Id of device)
- $value (valueNo of the data source [thats the value of the valueXYZ configuration items] or for RGB or dimmable lights the color property [one of state, hue, saturation, brightness])
- $state (new value to be set)
- $rgb (Please see note below)

The plugin reads command output of STDOUT! Any return value (exit code) other then 0 will be treated as error.

Example (Light):
{
	"command": "/path/to/rgb-controller -d $device -p $value -s $state",
	"device": "rgb1",
	"color": true
}
The above example will result in the following call:

get-call: /path/to/rgb-controller -d rgb1 -p hue -s
set-call: /path/to/rgb-controller -d rgb1 -p hue -s 240

Please note, that changing color in a client results always in multiple calls (hue-value, saturation value). iOS will not provide all HSL-Values at once (i think thats a bug, but however...). RGB bulb needs state to handle partitial changes!!! The Plugin will cache values as good as possible and can provide a rgb value as well.

## File backend (development in progress)
It will also be possible to read/write changes to a file. That could sometimes useful, if you have a cron job or something running that aquires sensor information. To se that, you have to use file=/path/to/datafile in your accessory config block.

The file backend supports two modes: Plain and JSON. Format=plain is the default format. For format=json a file should looks like a JSON-Response (with all required information in it). In case of format=plain

Because plain format can only contain one value at the time. If you use a multiple sensor devices (e.g. temperature sensor with battery) the file will be interpreted as prefix!!! You have to use the valueXY configuration properties for additional file prefixes. Example:
{
		"file": "/path/to/file",
		"format": "plain",
		"valueTemperature": "-t",
		"valueBattery": "-b"
}
For getting battery voltage level the plugin look up a file /path/to/file-b their hopefully a number or float can be found ;)

Same example for JSON-formatted files:
{
		"file": "/path/to/file",
		"format": "plain",
		"valueTemperature": "-t",
		"valueBattery": "-b"
}

The data file should provide following structure:
{
	"result": {
		"date": "",
		"values": {
			"-t": {
				"value": 23.0
			},
			"-b": {
				"value": 3.27
			}
		}
	}
}


# Contributing

Intrigued? Missing any domotiga devices? Love HomeKit and Homebridge? - Feel free to contribute by sending pull requests to get this project going in a more generic direction. Or just open an issue if you have more questions or ideas.

# Installation

1. Install homebridge using:  ```npm install -g homebridge```
2. Install this plugin using: ```npm install -g git+https://github.com/Samfox2/homebridge-domotiga.git``` or ```npm install -g homebridge-domotiga```
3. Update your configuration file. See sample-config.json in this repository for a sample.

# Configuration

Configuration sample:

 ```
"platforms": [
    {
        "platform": "Domotiga",
        "name": "Domotiga",
        "host": "localhost",
        "port": "9090",
        "devices": [
            {
                "name": "Sensor garden",
                "service": "TemperatureSensor",
                "manufacturer": "DIY",
                "model": "TinyTX",
                "device": "81",
                "valueTemperature": "1",
                "valueHumidity": "2",
                "valueAirPressure": "3",
                "valueBattery": "4",
                "lowbattery": "3000"
                "polling": true,
                "pollInMs": "1000"
            },
            {
                "name": "Sensor gardenhouse",
                "service": "HumiditySensor",
                "manufacturer": "DIY",
                "model": "TinyTX",
                "device": "88",
                "valueHumidity": "2",
                "valueBattery": "4",
                "lowbattery": "3000"
				"polling": false,
                "pollInMs": "1000"
            },
            {
                "name": "Combined AirQualitySensor livingroom",
                "service": "AirQualitySensor",
                "device": "83",
                "valueAirQuality": "1",
                "valueTemperature": "2",
                "valueHumidity": "3",
                "valueAirPressure": "4",
                "valueBattery": "5",
                "lowbattery": "3000"
            },
            {
                "name": "Combined AirQualitySensor with ppm display",
                "service": "FakeEveAirQualitySensor",
                "device": "89",
                "valueAirQuality": "1",
                "valueTemperature": "2",
                "valueHumidity": "3",
                "valueAirPressure": "4",
                "valueBattery": "5",
                "lowbattery": "3000"
            },
            {
                "name": "AirQualitySensor bedroom without battery",
                "service": "AirQualitySensor",
                "device": "82",
                "valueAirQuality": "1"
            },
            {
                "name": "PC",
                "service": "Contact",
                "device": "77",
                "valueContact": "1",
                "valueBattery": "2",
                "lowbattery": "3000"
            },
            {
                "name": "Printer",
                "service": "Switch",
                "device": "79",
                "valueSwitch": "1"
            },
            {
                "name": "Utility room",
                "service": "LeakSensor",
                "device": "25",
                "valueLeakSensor": "1",
                "valueBattery": "2",
                "lowbattery": "3000"
            },
            {
                "name": "Entrance",
                "service": "MotionSensor",
                "device": "26",
                "valueMotionSensor": "1",
                "valueBattery": "2",
                "lowbattery": "3000"
            },
            {
                "name": "Outlet",
                "service": "Outlet",
                "device": "72",
                "valueOutlet": "1",
                "valuePowerConsumption": "3",
                "valueTotalPowerConsumption": "7"
            },
            {
                "name": "Powermeter basement",
                "service": "Powermeter",
                "device": "44",
                "valuePowerConsumption": "1",
                "valueTotalPowerConsumption": "2"
            }
        ]
    }
]
```

Fields:

* ```"platform":``` Must always be Domotiga  (required)
* ```"name":``` Can be anything
* ```"host":``` The hostname or ip of the machine running Domotiga (required)
* ```"port":``` The port that Domotiga is using (usually 9090) (required)
* ```"service":``` Service that Domotiga device represents (required)
* ```"manufacturer":``` Manufacturer of accessory (optional)
* ```"model":``` Model of accessory (optional)
* ```"device":```  Domotiga device no. (required)
* ```"valueTemperature":``` Domotiga device value no. of temperature in °C (required for "TemperatureSensor")
* ```"valueHumidity":``` Value no. of humidity in % (required for "HumiditySensor")
* ```"valueAirPressure":``` Value no. of air pressure in hPa (required for "FakeEveWeatherSensor")
* ```"valueAirQuality":```  Value no. of the air quality VOC (required for "AirQualitySensor" and "FakeEveAirQualitySensor")
* ```"valueContact":```  Value no. of the contact (required for "Contact")
* ```"valueSwitch":```   Value no. of the switch (required for "Switch")
* ```"valueOutlet":```   Value no. of the outlet (required for "Outlet")
* ```"valueDoor":```     Value no. of the door (required for "Door")
* ```"valueWindow":```   Value no. of the window (required for "Window")
* ```"valueWindowCovering":```   Value no. of the window covering (required for "Window Covering")
* ```"valueLeakSensor":``` Value no. of the leaksensor (required for "LeakSensor")
* ```"valueMotionSensor":``` Value no. of the motionsensor (required for "MotionSensor")
* ```"valueBattery":```  Value no. of battery in mV
* ```"lowbattery":```    Min. battery level which activates "low battery warning" in mV (*obsolete*)
* ```"polling":```   Enable/disable polling with "true" or "false" (optional)
* ```"pollInMs":```  Number of milliseconds to wait before polling the database to report open/closed state (optional)


# New configuration options
* ```"valueLight":``` Value no. of the leaksensor (optional)
* ```"minTemperature":```  Minimal acceptable temperature (optional; default: -55)
* ```"maxTemperature":```  Maximal acceptable temperature (optional; default: 100)
* ```"maxAgeInSeconds":```
- batteryVoltage (standard battery level in Volt; no default; e.g. 3.3)
* ```"batteryVoltageLimit":``` low voltage limit for warnings in volt: default is 90% of batteryVoltage). This option will replace lowbattery soon)
* ```"debug":```	verbose logging)
* ```"disableCaching":```	disableCaching
* ```"maxAgeInSeconds":``` Validate result's date-field (if given;). date must be provided in RFC822 format; for files with format=plain the file modified date will be used; (optional)

Please be warned: If a result is older than the given maxAgeInSeconds the value will *not be shown* in client anymore. Unfortunately there is no other way to yell "it's an old value". But i think its better to have no value then starring on a old value and think everything is ok.... Out of range temperature values can be marked in client - at least that is a supported feature)

Not yet supported by all homekit apps:

* ```"valuePowerConsumption":```  Value no. of the consumption in W (required for custom "Powermeter")
* ```"valueTotalPowerConsumption":```  Value no. of the total consumption in kWh
