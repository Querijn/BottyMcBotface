import { fileBackedObject } from "./util";
import Discord = require("discord.js");
import feedReader = require("feed-read");

export interface TechblogSettings {
    CheckInterval: number;
    Server: string;
    Channel: string;
    URL: string;
}

export interface TechblogData {
    Last: number;
}

export default class Techblog {
    private bot: Discord.Client;
    private settings: TechblogSettings;
    private data: TechblogData;
    private channel: Discord.TextChannel;

    constructor(bot: Discord.Client, settingsFile: string, dataFile: string) {
        this.settings = fileBackedObject(settingsFile);

        this.data = fileBackedObject(dataFile);
        console.log("Successfully loaded TechblogReader data file.");

        this.bot = bot;

        this.bot.on("ready", () => {
            if (!this.data.Last) this.data.Last = Date.now();

            const guild = this.bot.guilds.find("name", this.settings.Server);
            if (!guild) {
                console.error(`Incorrect setting for the server: ${this.settings.Server}`);
                return;
            }

            this.channel = guild.channels.find("name", this.settings.Channel) as Discord.TextChannel;
            if (!this.channel) {
                console.error(`Incorrect setting for the channel: ${this.settings.Channel}`);
                return;
            }

            console.log("TechblogReader extension loaded.");

            setInterval(() => {
                this.checkFeed();
            }, this.settings.CheckInterval);
        });
    }

    checkFeed() {
        feedReader(this.settings.URL, (error, articles) => {
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
