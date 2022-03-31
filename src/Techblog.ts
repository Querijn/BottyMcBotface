import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import fetch from "node-fetch";
import Discord = require("discord.js");
import { parseXmlString } from "./TechBlog/xml_parser";

export interface TechblogData {
    Last: number;
}

export default class Techblog {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private data: TechblogData;
    private channel: Discord.TextChannel;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, dataFile: string) {
        this.sharedSettings = sharedSettings;

        this.data = fileBackedObject(dataFile, "www/" + dataFile);
        console.log("Successfully loaded TechblogReader data file.");

        this.bot = bot;

        this.bot.on("ready", async () => {
            if (!this.data.Last) this.data.Last = Date.now();

            const guild = this.bot.guilds.cache.get(this.sharedSettings.server.guildId);
            if (!guild) {
                console.error(`TechBlog: Unable to find server with ID: ${this.sharedSettings.server}`);
                return;
            }

            this.channel = guild.channels.cache.find(c => c.name === this.sharedSettings.techBlog.channel) as Discord.TextChannel;
            if (!this.channel) {
                if (this.sharedSettings.botty.isProduction) {
                    console.error(`TechBlog: Unable to find channel: ${this.sharedSettings.techBlog.channel}`);
                    return;
                }
                else {
                    this.channel = await guild!.channels.create(this.sharedSettings.techBlog.channel, { type: "text" }) as Discord.TextChannel;
                }
            }

            console.log("TechblogReader extension loaded.");

            this.checkFeed();
            setInterval(() => {
                this.checkFeed();
            }, this.sharedSettings.techBlog.checkInterval);
        });
    }

    private async checkFeed() {
        try {
            let response = await fetch(this.sharedSettings.techBlog.url, { "headers": { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:98.0) Gecko/20100101 Firefox/98.0" }, });
            if (response.ok == false) {
                console.warn(`Unable to fetch TechBlog from '${this.sharedSettings.techBlog.url}': ${response.statusText}`);
                return;
            }

            const xmlText = await response.text();
            const asJson = parseXmlString(xmlText);
            const results = asJson.rss.channel;

            for (const article of results.item.reverse()) { // Old to new
                const timestamp = new Date(article.pubDate).getTime();
                if (timestamp > this.data.Last) {
                    this.channel.send(article.link);
                    this.data.Last = timestamp;
                }
            }
        }
        catch (error) {
            
            console.error("Error reading tech blog RSS feed:", error);
        }
    }
}
