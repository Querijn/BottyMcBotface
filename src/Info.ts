import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

// If the Collection contains anything in the other array
const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: Array<any>) => {
    return arr1.some(v => {
        return arr2.indexOf(v) >= 0;
    });
};

export interface InfoData {
    Command: string;
    Message: string;
}

export default class Info {
    private bot: Discord.Client;
    private infos: InfoData[];
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, userFile: string) {
        console.log("Requested Info extension..");
        this.bot = bot;

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
        if (!findOne(message.member.roles, this.sharedSettings.info.allowedRoles)) return;

        const split = message.cleanContent.split(" ");
        
        let action: "add" | "remove" | "retrieve" | undefined;
        if (split[0].match(/^(!|\/)infoadd$/gi)) action = "add";
        if (split[0].match(/^(!|\/)inforemove$/gi)) action = "remove";
        if (split[0].match(/^(!|\/)info$/gi)) action = "retrieve";

        if (!action) return;
        if (split.length <= 1) return;

        let response: string | undefined;
        switch (action) {
            case "add":
                if (split.length <= 2) return;
                response = this.addInfo(split[1], split.slice(2).join(" "));
                break;
            case "remove":
                response = this.removeInfo(split[1]);
                break;
            case "retrieve":
                response = this.fetchInfo(split[1]);
                break;
            default:
                return;
        }

        if (!response) return;

        message.reply(response);
    }

    private addInfo(command: string, message: string) {
        const alreadyExists = this.infos.some(info => info.Command === command);
        if (alreadyExists) return;

        const newInfo: InfoData = {
            Command: command,
            Message: message
        };

        this.infos.push(newInfo);
        return `Successfully added ${command}`;
    }

    private removeInfo(command: string) {
        const index = this.infos.findIndex(info => {
            return info.Command === command;
        });

        if (index === -1) return;

        this.infos.splice(index, 1);
        return `Successfully removed ${command}`;
    }

    private fetchInfo(command: string) {
        const info = this.infos.find(info => {
            return info.Command === command;
        });

        if (!info) return;

        return info.Message;
    }
}
