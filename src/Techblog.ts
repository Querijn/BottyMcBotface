import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import feedReader = require("feed-read");

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

        this.bot.on("ready", async() => {
            if (!this.data.Last) this.data.Last = Date.now();

            const guild = this.bot.guilds.get(this.sharedSettings.server);
            if (!guild) {
                console.error(`TechBlog: Unable to find server with ID: ${this.sharedSettings.server}`);
                return;
            }

            this.channel = guild.channels.find("name", this.sharedSettings.techBlog.channel) as Discord.TextChannel;
            if (!this.channel) {
                if (this.sharedSettings.botty.isProduction) {
                    console.error(`TechBlog: Unable to find channel: ${this.sharedSettings.techBlog.channel}`);
                    return;
                }
                else {
                    this.channel = await guild!.createChannel(this.sharedSettings.techBlog.channel, "text") as Discord.TextChannel;
                }
            }

            console.log("TechblogReader extension loaded.");

            setInterval(() => {
                this.checkFeed();
            }, this.sharedSettings.techBlog.checkInterval);
        });
    }

    private checkFeed() {
        feedReader(this.sharedSettings.techBlog.url, (error, articles) => {
            if (error) {
                console.error("Error reading tech blog RSS feed:", error);
                return;
            }

            for (const article of articles.reverse()) {
                const timestamp = +article.published;
                if (timestamp > this.data.Last) {
                    this.channel.send(`A new article has been posted on the Riot Games Tech Blog: \`${article.title}\`\n${article.link}`);
                    this.data.Last = timestamp;
                }
            }
        });
    }
}
