import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

/**
 * Log handler.
 *
 * @export
 * @class AutoReact
 */
export default class AutoReact {
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

    private onBot() {
        const guild = this.bot.guilds.get(this.sharedSettings.logger.server);
        if (!guild) {
            console.error(`Logger: Incorrect settings for guild ID ${this.sharedSettings.logger.server}`);
            return;
        }

        const errorChannel = guild.channels.find("name", this.sharedSettings.logger.errorChannel);
        if (!errorChannel || !(errorChannel instanceof Discord.TextChannel)) {
            console.error(`Logger: Incorrect setting for the channel: ${this.sharedSettings.logger.errorChannel}`);
            return;
        }
        this.errorChannel = errorChannel as Discord.TextChannel;

        const logChannel = guild.channels.find("name", this.sharedSettings.logger.logChannel);
        if (!logChannel || !(logChannel instanceof Discord.TextChannel)) {
            console.error(`Logger: Incorrect setting for the channel: ${this.sharedSettings.logger.logChannel}`);
            return;
        }
        this.logChannel = logChannel as Discord.TextChannel;

        this.onLoad();
        console.log("Logger extension loaded.");
    }

    private onLoad() {
        if (this.loaded) return;

        this.oldLog = console.log;
        this.oldError = console.error;
        this.oldWarning = console.warn;

        console.log = this.onLog.bind(this);
        console.error = this.onError.bind(this);
        console.warn = this.onWarning.bind(this);

        this.loaded = true;
    }

    private onUnload() {
        if (!this.loaded) return;

        console.log = this.oldLog;
        console.error = this.oldError;
        console.warn = this.oldWarning;

        this.loaded = false;
    }

    private onLog(message?: any, ...optionalParams: any[]) {
        this.oldLog(message, ...optionalParams);

        try {
            this.logChannel.send(`[${(new Date()).toUTCString()}] Log: ${message.toString()}`);
            for (let i = 0; i < optionalParams.length; i++) {
                this.logChannel.send(`[${(new Date()).toUTCString()}] Log param ${(i + 1)}: {optionalParams.toString()}`);
            }
        } catch (e) {
            this.oldError(`Error trying to send a log message: ${e.toString()}`);
        }
    }

    private onWarning(message?: any, ...optionalParams: any[]) {
        this.oldWarning(message, ...optionalParams);

        try {
            this.errorChannel.send(`[${(new Date()).toUTCString()}] Warning: ${message.toString()}`);
            for (let i = 0; i < optionalParams.length; i++) {
                this.errorChannel.send(`[${(new Date()).toUTCString()}] Warning param ${(i + 1)}: ${optionalParams.toString()}`);
            }
        } catch (e) {
            this.oldError(`Error trying to send a warning message: ${e.toString()}`);
        }
    }

    private onError(message?: any, ...optionalParams: any[]) {
        this.oldError(message, ...optionalParams);

        try {
            this.errorChannel.send(`[${(new Date()).toUTCString()}] Error: ${message.toString()}`);
            for (let i = 0; i < optionalParams.length; i++) {
                this.errorChannel.send(`[${(new Date()).toUTCString()}] Error param ${(i + 1)}: ${optionalParams.toString()}`);
            }
        } catch (e) {
            this.oldError(`Error trying to send an error message: ${e.toString()}`);
        }
    }
}
