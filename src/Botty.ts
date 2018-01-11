import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";

import Discord = require("discord.js");

export interface BottySettings {
    Discord: {
        Key: string;
        Owner: number;
    };
}

export default class Botty {
    public readonly client = new Discord.Client();
    private personalSettings: PersonalSettings;
    private sharedSettings: SharedSettings;

    constructor(personalSettings: PersonalSettings, sharedSettings: SharedSettings) {
        this.personalSettings = personalSettings;
        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded bot settings.");

        this.client
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
            .on("disconnect", () => console.warn("Disconnected!"))
            .on("reconnecting", () => console.warn("Reconnecting..."))
            .on("connect", () => console.warn("Connected."))
            .on("ready", this.onConnect.bind(this));

    }

    onConnect() {
        console.log("Bot is logged in and ready.");

        // Set correct nickname
        if (this.personalSettings.isProduction) {
            const guild = this.client.guilds.get(this.sharedSettings.server);
            if (!guild) {
                console.error(`Botty: Incorrect setting for the server: ${this.sharedSettings.server }`);
                return;
            }

            guild.me.setNickname("Botty McBotface");
        }
    }

    start() {
        return this.client.login(this.personalSettings.discord.key);
    }
}
