const Discord = require("discord.js");
const FileSystem = require("fs");

class Botty
{
    constructor(a_SettingsFile)
    {
        const t_Data = FileSystem.readFileSync(a_SettingsFile, "utf8");
        this.m_Settings = JSON.parse(t_Data);
        console.log("Successfully loaded settings file.");

        this.m_Client = new Discord.Client();

        this.m_Client
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
	        .on("disconnect", () => { console.warn("Disconnected!"); })
	        .on("reconnecting", () => { console.warn("Reconnecting..."); })
	        .on("connect", () => { console.warn("Connected."); });

        this.m_Client.on("ready", () => 
        {
            console.log("Bot is logged in and ready.");
        });
    }

    Start()
    {
        this.m_Client.login(this.m_Settings.Discord.Key);
    }
    
    get Client()
    {
        return this.m_Client;
    }
}

exports.Botty = Botty;
