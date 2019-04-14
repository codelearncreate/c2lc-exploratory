/*
Coding to Learn and Create
Copyright 2019 OCAD University

Licensed under the 3-Clause BSD license. You may not use this file except in compliance with this license.

You may obtain a copy of the 3-Clause BSD License at
https://github.com/simonbates/c2lc-exploratory/raw/master/LICENSE.txt
*/

/* global Promise, Uint8Array */

// TODO: Extract grade bluetoothDeviceDriver

(function () {

    "use strict";

    var c2lc = fluid.registerNamespace("c2lc");

    fluid.defaults("c2lc.spheroDriver", {
        gradeNames: "fluid.modelComponent",
        bleUuids: {
            bleService: "22bb746f-2bb0-7554-2d6f-726568705327",
            wakeChar: "22bb746f-2bbf-7554-2d6f-726568705327",
            antiDosChar: "22bb746f-2bbd-7554-2d6f-726568705327",
            robotControlService: "22bb746f-2ba0-7554-2d6f-726568705327",
            commandsChar: "22bb746f-2ba1-7554-2d6f-726568705327"
        },
        model: {
            connectionState: "notConnected"
            // Values: "notConnected", "connecting", "connected"
        },
        members: {
            wakeChar: null, // Will be set at connect
            antiDosChar: null, // Will be set at connect
            commandsChar: null // Will be set at connect
        },
        invokers: {
            connect: {
                funcName: "c2lc.spheroDriver.connect",
                args: [
                    "{that}",
                    "{that}.options.bleUuids",
                    "{that}.applier"
                ]
            },
            sendCommand: {
                funcName: "c2lc.spheroDriver.sendCommand",
                args: [
                    "{that}",
                    "{arguments}.0" // commandOptions
                ]
            },
            setRgbLed: {
                funcName: "c2lc.spheroDriver.setRgbLed",
                args: [
                    "{that}",
                    "{arguments}.0", // red
                    "{arguments}.1", // green
                    "{arguments}.2" // blue
                ]
            }
        }
    });

    c2lc.spheroDriver.connect = function (spheroDriver, bleUuids, applier) {
        applier.change("connectionState", "connecting");
        navigator.bluetooth.requestDevice({
            filters: [{ services: [bleUuids.robotControlService] }],
            optionalServices: [bleUuids.bleService]
        }).then(function (device) {
            return device.gatt.connect();
        }).then(function (server) {
            return Promise.all([
                c2lc.spheroDriver.getCharacteristic(server, bleUuids.bleService, bleUuids.wakeChar),
                c2lc.spheroDriver.getCharacteristic(server, bleUuids.bleService, bleUuids.antiDosChar),
                c2lc.spheroDriver.getCharacteristic(server, bleUuids.robotControlService, bleUuids.commandsChar)
            ]);
        }).then(function (characteristics) {
            spheroDriver.wakeChar = characteristics[0];
            spheroDriver.antiDosChar = characteristics[1];
            spheroDriver.commandsChar = characteristics[2];
            return c2lc.spheroDriver.init(spheroDriver);
        }).then(function () {
            applier.change("connectionState", "connected");
        }).catch(function (error) { // eslint-disable-line dot-notation
            console.log(error.name);
            console.log(error.message);
            applier.change("connectionState", "notConnected");
        });
    };

    c2lc.spheroDriver.getCharacteristic = function (server, serviceUuid, charUuid) {
        return server.getPrimaryService(serviceUuid).then(function (service) {
            return service.getCharacteristic(charUuid);
        });
    };

    c2lc.spheroDriver.init = function (spheroDriver) {
        return c2lc.spheroDriver.setAntiDos(spheroDriver.antiDosChar).then(function () {
            return c2lc.spheroDriver.wake(spheroDriver.wakeChar);
        });
    };

    c2lc.spheroDriver.setAntiDos = function (antiDosChar) {
        return antiDosChar.writeValue(new Uint8Array([
            "0".charCodeAt(0),
            "1".charCodeAt(0),
            "1".charCodeAt(0),
            "i".charCodeAt(0),
            "3".charCodeAt(0)
        ]));
    };

    c2lc.spheroDriver.wake = function (wakeChar) {
        return wakeChar.writeValue(new Uint8Array([0x01]));
    };

    // Returns: A Promise representing completion of the command
    c2lc.spheroDriver.sendCommand = function (spheroDriver, commandOptions) {
        var togo = fluid.promise();
        var packet = c2lc.spheroDriver.buildPacket(commandOptions);
        spheroDriver.commandsChar.writeValue(packet).then(function () {
            togo.resolve();
        }).catch(function (error) { // eslint-disable-line dot-notation
            togo.reject(error);
            // TODO: Move printing to the interpreter
            console.log(error.name);
            console.log(error.message);
        });
        return togo;
    };

    c2lc.spheroDriver.buildPacket = function (commandOptions) {
        var dataLength = commandOptions.data ? commandOptions.data.length : 0;
        var packet = new Uint8Array(7 + dataLength);

        packet[0] = commandOptions.sop1;
        packet[1] = commandOptions.sop2;
        packet[2] = commandOptions.did;
        packet[3] = commandOptions.cid;
        packet[4] = commandOptions.seq;
        packet[5] = dataLength + 1;

        for (var i = 0; i < dataLength; i++) {
            packet[6 + i] = commandOptions.data[i];
        }

        packet[6 + dataLength] = c2lc.spheroDriver.calculateChecksum(packet, 2, 6 + dataLength);

        return packet;
    };

    c2lc.spheroDriver.calculateChecksum = function (data, begin, end) {
        var sum = 0;
        for (var i = begin; i < end; i++) {
            sum += data[i];
        }
        return (~sum) & 0xFF;
    };

    // Sphero Commands

    c2lc.spheroDriver.setRgbLed = function (spheroDriver, red, green, blue) {
        return c2lc.spheroDriver.sendCommand(spheroDriver, {
            sop1: 0xFF,
            sop2: 0xFE,
            did: 0x02,
            cid: 0x20,
            seq: 0x00,
            data: [red, green, blue, 0x00]
        });
    };

})();
