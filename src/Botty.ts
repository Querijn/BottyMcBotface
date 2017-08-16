import Discord = require("discord.js");
import { fileBackedObject } from "./util";

export interface BottySettings {
    Discord: {
        Key: string;
        Owner: number;
    };
}

export default class Botty {
    private m_Client = new Discord.Client();
    private m_Settings: BottySettings;

    constructor(a_SettingsFile: string) {
        this.m_Settings = fileBackedObject(a_SettingsFile);
        console.log("Successfully loaded settings file.");

        this.m_Client
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
            .on("disconnect", () => console.warn("Disconnected!"))
            .on("reconnecting", () => console.warn("Reconnecting..."))
            .on("connect", () => console.warn("Connected."))
            .on("ready", () => console.log("Bot is logged in and ready."));
    }

    Start() {
        return this.m_Client.login(this.m_Settings.Discord.Key);
    }

    get Client() {
        return this.m_Client;
    }
}
