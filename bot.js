const Discord = require("discord.js");
const util = require("./util.js");

class Botty
{
    constructor(a_SettingsFile)
    {
        this.m_Settings = util.fileBackedObject(a_SettingsFile);
        console.log("Successfully loaded settings file.");

        this.m_Client = new Discord.Client();

        this.m_Client
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
	        .on("disconnect", () => console.warn("Disconnected!"))
	        .on("reconnecting", () => console.warn("Reconnecting..."))
	        .on("connect", () => console.warn("Connected."))
            .on("ready", () => console.log("Bot is logged in and ready."));
    }

    Start()
    {
        return this.m_Client.login(this.m_Settings.Discord.Key);
    }
    
    get Client()
    {
        return this.m_Client;
    }
}

exports.Botty = Botty;
