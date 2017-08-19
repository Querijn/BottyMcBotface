import Discord = require("discord.js");
import { fileBackedObject } from "./util";
import prettyMs = require("pretty-ms");

export interface UptimeSettings {
    CheckInterval: number;
}

export interface UptimeData {
    LastUptime: number;
    UptimeStart: number;
    TotalDowntime: number;
}

export default class Uptime {
    private bot: Discord.Client;
    private settings: UptimeSettings;
    private data: UptimeData;

    constructor(bot: Discord.Client, settingsFile: string, dataFile: string) {
        console.log("Requested uptime extension..");

        this.settings = fileBackedObject(settingsFile);
        console.log("Successfully loaded uptime settings file.");

        this.data = fileBackedObject(dataFile);
        console.log("Successfully loaded uptime data file.");

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));
        setInterval(this.onUpdate.bind(this), this.settings.CheckInterval);
    }

    onBot() {
        console.log("uptime extension loaded.");
    }

    onMessage(message: Discord.Message) {
        if (!message.content.startsWith("!uptime")) return;
        message.reply(`the bot has been up for ${this.uptimePercentage}% of the time. Bot started ${this.uptime} ago.`);
    }

    onUpdate() {
        let timeDiff = Date.now() - this.data.LastUptime;

        // To restart, basically set either of these values to 0
        if (this.data.LastUptime === 0 || this.data.UptimeStart === 0) {
            this.data.UptimeStart = Date.now();
            this.data.TotalDowntime = 0;
            timeDiff = 0;
        }

        if (timeDiff > this.settings.CheckInterval + 1000) {
            // Give it some error
            this.data.TotalDowntime += timeDiff;
            console.log(`Noticed a downtime of ${timeDiff * 0.001} seconds.`);
        }

        this.data.LastUptime = Date.now();
    }

    get uptimePercentage() {
        const timeSpan = new Date().getTime() - this.data.UptimeStart;
        const percentage = 1.0 - this.data.TotalDowntime / timeSpan;
        return +(percentage * 100.0).toFixed(3);
    }

    get uptime() {
        return prettyMs(Date.now() - this.data.UptimeStart, { verbose: true });
    }
}
