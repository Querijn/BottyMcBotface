import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

/**
 * Log handler.
 *
 * @export
 * @class Logger
 */
export default class Logger {
    private bot: Discord.Client;
    private errorChannel: Discord.TextChannel;
    private logChannel: Discord.TextChannel;
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

    public async onBot() {
        const guild = this.bot.guilds.cache.get(this.sharedSettings.logger.server);
        if (!guild) {
            console.error(`Logger: Unable to find server with ID: ${this.sharedSettings.logger.server}`);
            return;
        }

        const isProduction = this.sharedSettings.botty.isProduction;
        let environment: {
            errorChannel: string;
            logChannel: string;
        };

        if (isProduction && this.sharedSettings.logger.prod) {
            environment = this.sharedSettings.logger.prod;
        }

        else if (!isProduction && this.sharedSettings.logger.dev) {
            environment = this.sharedSettings.logger.dev;
        }

        // Fallback to old style
        else /*if (!this.sharedSettings.logger.prod && !this.sharedSettings.logger.dev)*/ {
            environment = this.sharedSettings.logger;
        }

        const errorChannel = guild.channels.cache.find(c => c.name === environment.errorChannel);
        if (!errorChannel || !(errorChannel instanceof Discord.TextChannel)) {
            console.error(`Logger: Incorrect setting for the error channel: ${environment.errorChannel}, isProduction: ${isProduction}`);
            return;
        }
        this.errorChannel = errorChannel as Discord.TextChannel;

        let logChannel = guild.channels.cache.find(c => c.name === environment.logChannel);
        if (!logChannel || !(logChannel instanceof Discord.TextChannel)) {
            if (this.sharedSettings.botty.isProduction) {
                console.error(`Logger: Incorrect setting for the log channel: ${environment.logChannel}, isProduction: ${isProduction}`);
                return;
            }
            else {
                logChannel = await guild!.channels.create({name: environment.logChannel, type: Discord.ChannelType.GuildText}) as Discord.TextChannel;
            }
        }
        this.logChannel = logChannel as Discord.TextChannel;

        this.onLoad();
        console.log("Logger extension loaded.");
    }

    public onLoad() {
        if (this.loaded) return;

        this.oldLog = console.log;
        this.oldError = console.error;
        this.oldWarning = console.warn;

        console.log = this.onLog.bind(this);
        console.error = this.onError.bind(this);
        console.warn = this.onWarning.bind(this);

        this.loaded = true;
    }

    public onUnload() {
        if (!this.loaded) return;

        console.log = this.oldLog;
        console.error = this.oldError;
        console.warn = this.oldWarning;

        this.loaded = false;
    }

    public onLog(message?: any, ...optionalParams: any[]) {
        this.oldLog(message, ...optionalParams);
        this.logToDiscord("Log", message, optionalParams);
    }

    public onWarning(message?: any, ...optionalParams: any[]) {
        this.oldWarning(message, ...optionalParams);
        this.logToDiscord("Warning", message, optionalParams);
    }

    public onError(message?: any, ...optionalParams: any[]) {
        this.oldError(message, ...optionalParams);
        this.logToDiscord("Error", message, optionalParams);
    }

    private logToDiscord(type: "Error" | "Warning" | "Log", message?: any, ...optionalParams: any[]) {
        const logChannel = (type == "Log") ? this.logChannel : this.errorChannel;
        const chunks = `[${(new Date()).toUTCString()}] ${type}: ${message.toString()}`.match(/.{1,2000}/sg) || [message.toString()];
        chunks.forEach(chunk => { logChannel.send(chunk).catch(e => this.oldError(`Error trying to send an ${type.toLocaleLowerCase()} message: ${e.toString()}`))});
        for (let i = 0; i < optionalParams.length; i++) {
            if (optionalParams.reduce((accumulator, currentValue) => accumulator + currentValue.length, 0) == 0) return;
            const chunks = `[${(new Date()).toUTCString()}] ${type} param ${(i + 1)}: ${optionalParams.toString()}`.match(/.{1,2000}/sg) || [message.toString()];
            chunks.forEach(chunk => { logChannel.send(chunk).catch(e => this.oldError(`Error trying to send an ${type.toLocaleLowerCase()} message: ${e.toString()}`))});
        }
    }
}
