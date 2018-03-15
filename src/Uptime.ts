import Discord = require("discord.js");
import prettyMs = require("pretty-ms");

import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

export interface UptimeData {
    LastUptime: number;
    UptimeStart: number;
    TotalDowntime: number;
}

export default class Uptime {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;
    private data: UptimeData;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, personalSettings: PersonalSettings, dataFile: string) {
        console.log("Requested uptime extension..");

        this.sharedSettings = sharedSettings;
        this.personalSettings = personalSettings;
        console.log("Successfully loaded uptime settings.");

        this.data = fileBackedObject(dataFile);
        console.log("Successfully loaded uptime data file.");

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));
        setInterval(this.onUpdate.bind(this), this.sharedSettings.uptimeSettings.checkInterval);
    }

    private onBot() {
        console.log("uptime extension loaded.");
    }

    private onMessage(message: Discord.Message) {
        if (!message.content.startsWith("!uptime")) return;
        message.reply(`the bot has been up for ${this.uptimePercentage}% of the time. Bot started ${this.uptime} ago.`);
    }

    private onUpdate() {
        let timeDiff = Date.now() - this.data.LastUptime;

        // To restart, basically set either of these values to 0
        if (this.data.LastUptime === 0 || this.data.UptimeStart === 0) {
            this.data.UptimeStart = Date.now();
            this.data.TotalDowntime = 0;
            timeDiff = 0;
        }

        if (timeDiff > this.sharedSettings.uptimeSettings.checkInterval + 4000) {
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
