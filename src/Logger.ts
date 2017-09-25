import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";

import Discord = require("discord.js");

export default class AutoReact {
    private bot: Discord.Client;
    private channel: Discord.TextChannel;
    private sharedSettings: SharedSettings;

    private loaded: boolean = false;
    private oldLog: (message?: any, ...optionalParams: any[]) => void;
    private oldError: (message?: any, ...optionalParams: any[]) => void;
    private oldWarning: (message?: any, ...optionalParams: any[]) => void;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        console.log("Requested Logger extension..");
        this.bot = bot;

        this.sharedSettings = sharedSettings;

        this.bot.on("ready", this.onBot.bind(this));
    }

    onBot() {
        let guild = this.bot.guilds.get(this.sharedSettings.logger.server);
        if (!guild) {
            console.error(`Logger: Incorrect settings for guild ID ${this.sharedSettings.logger.server}`);
            return;
        }

        const channel = guild.channels.find("name", this.sharedSettings.logger.channel);
        if (!channel || !(channel instanceof Discord.TextChannel)) {
            console.error(`Logger: Incorrect setting for the channel: ${this.sharedSettings.logger.channel}`);
            return;
        }
        this.channel = channel as Discord.TextChannel;

        this.onLoad();
        console.log("Logger extension loaded.");
    }

    onLoad() { 
        if (this.loaded) return;
        
        this.oldLog = console.log;
        this.oldError = console.error;
        this.oldWarning = console.warn;
        
        console.log = this.onLog.bind(this);
        console.error = this.onError.bind(this);
        console.warn = this.onWarning.bind(this);

        this.loaded = true;
    }
    
    onUnload() { 
        if (!this.loaded) return;
        
        console.log = this.oldLog;
        console.error = this.oldError;
        console.warn = this.oldWarning;

        this.loaded = false;
    }

    onLog(message?:any, ...optionalParams: any[]) {
        this.oldLog(message, ...optionalParams);
        
        try {
            this.channel.send(`Log: ${message.toString()}`);
            for(let i = 0; i < optionalParams.length; i++) {
                this.channel.send(`Log param ${(i+1)}: {optionalParams.toString()}`);
            }
        }
        catch (e) {
            this.oldError(`Error trying to send a log message: ${e.toString()}`);
        }
    }
    
    onWarning(message?:any, ...optionalParams: any[]) {
        this.oldLog(message, ...optionalParams);
        
        try {
            this.channel.send(`Warning: ${message.toString()}`);
            for(let i = 0; i < optionalParams.length; i++) {
                this.channel.send(`Warning param ${(i+1)}: ${optionalParams.toString()}`);
            }
        }
        catch (e) {
            this.oldError(`Error trying to send a warning message: ${e.toString()}`);
        }
    }
    
    onError(message?:any, ...optionalParams: any[]) {
        this.oldLog(message, ...optionalParams);
        
        try {
            this.channel.send(`Error: ${message.toString()}`);
            for(let i = 0; i < optionalParams.length; i++) {
                this.channel.send(`Error param ${(i+1)}: ${optionalParams.toString()}`);
            }
        }
        catch (e) {
            this.oldError(`Error trying to send an error message: ${e.toString()}`);
        }
    }
}
