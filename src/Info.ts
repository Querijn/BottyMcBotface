import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import VersionChecker from "./VersionChecker";

import Discord = require("discord.js");

/**
 * Check if Collection contains anything in the other array.
 *
 * @param {Array} arr1
 * @param {Array} arr2
 */
const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: Array<any>) => {
    return arr2.some(v => {
        return !!arr1.get(v);
    });
};

export interface InfoData {
    command: string;
    message: string;
    counter: number;
}

export default class Info {
    private bot: Discord.Client;
    private infos: InfoData[];
    private sharedSettings: SharedSettings;
    private command: string;
    private versionChecker: VersionChecker;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, userFile: string, versionChecker: VersionChecker) {
        console.log("Requested Info extension..");
        this.bot = bot;
        this.command = sharedSettings.info.command;
        this.versionChecker = versionChecker;

        this.infos = fileBackedObject(userFile);
        console.log("Successfully loaded info file.");

        this.sharedSettings = sharedSettings;

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onInfo.bind(this));
    }

    onBot() {
        console.log("Info extension loaded.");
    }

    onInfo(message: Discord.Message) {
        if (message.author.bot) return;

        // if using .syntax we can only read notes
        let commandIsFetch = false;

        // Needs to start with '/' or '!' or in separate cases '.'
        const split = message.cleanContent.split(" ");
        if (split[0][0] === '.') commandIsFetch = true;
        else if (split[0][0] !== '!' && split[0][0] !== '/') return;
        
        // needs to start with command unless we are reading a note
        let command = split[0].substr(1);
        let nextIndex = 1;
        
        if (!commandIsFetch && command.startsWith(this.command)) {
            // !info <command>
            if (command.length === this.command.length) {
                command = split[1];
                nextIndex++;
            }

            // !info<command>
            else command = command.substr(this.command.length);
        } 

        // Things we can't fetch
        else if (command === "add" || command === "remove" || command === "list") 
            return;

        let response: string | undefined;
        switch (command) {
            case "add":
                // Only admins
                if (!message.member || !findOne(message.member.roles, this.sharedSettings.info.allowedRoles)) return;
                
                if (split.length <= nextIndex + 1) return;
                response = this.addInfo(split[nextIndex], split.slice(nextIndex + 1).join(" "));
                break;

            case "remove":
                // Only admins
                if (!message.member || !findOne(message.member.roles, this.sharedSettings.info.allowedRoles)) return;
                
                if (split.length <= nextIndex) return;
                response = this.removeInfo(split[nextIndex]);
                break;

            case "list":
                response = this.listInfo();
                break;

            default: // Retrieve or just !info

                let infoData: InfoData|null;
                if (!commandIsFetch) {
                    if (split.length <= 1) return;
                    infoData = this.fetchInfo(split[1]);
                }
                else {
                    infoData = this.fetchInfo(command);
                }

                if (infoData) {
                    response = infoData.message;
                    response = response.replace(/{ddragonVersion}/g, this.versionChecker.ddragonVersion);
                    response = response.replace(/{gameVersion}/g, this.versionChecker.gameVersion);
                    response = response.replace(/{counter}/g, infoData.counter.toString());
                }
                break;
        }

        if (!response) return;


        message.channel.send(response);
    }

    private addInfo(command: string, message: string) {
        const alreadyExists = this.infos.some(info => info.command === command);
        if (alreadyExists) return;

        const newInfo: InfoData = {
            command: command,
            message: message,
            counter: 0
        };

        this.infos.push(newInfo);
        return `Successfully added ${command}`;
    }

    private removeInfo(command: string) {
        const index = this.infos.findIndex(info => {
            return info.command === command;
        });

        if (index === -1) return;

        this.infos.splice(index, 1);
        return `Successfully removed ${command}`;
    }

    private listInfo() {
        const index = this.infos;

        let message = `The available info commands are: \n`;

        for (let i = 0; i < this.infos.length; i++) {
            message += `- \`!${this.command} ${this.infos[i].command}\`\n`;
        }

        return message;
    }

    private fetchInfo(command: string): InfoData | null {
        const info = this.infos.find(info => {
            return info.command === command;
        });

        if (!info) return null;

        // Backwards compatibility
        if (info.counter === undefined || info.counter === null) 
            info.counter = 0;

        info.counter++;
        return info;
    }
}
