import Discord = require("discord.js");
import { fileBackedObject } from "./util";

export interface BottySettings {
    Discord: {
        Key: string;
        Owner: number;
    };
}

export default class Botty {
    public readonly client = new Discord.Client();
    private settings: BottySettings;

    constructor(settingsFile: string) {
        this.settings = fileBackedObject(settingsFile);
        console.log("Successfully loaded settings file.");

        this.client
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
            .on("disconnect", () => console.warn("Disconnected!"))
            .on("reconnecting", () => console.warn("Reconnecting..."))
            .on("connect", () => console.warn("Connected."))
            .on("ready", () => console.log("Bot is logged in and ready."));
    }

    start() {
        return this.client.login(this.settings.Discord.Key);
    }
}
