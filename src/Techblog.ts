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
    private m_Bot: Discord.Client;
    private m_Settings: TechblogSettings;
    private m_Data: TechblogData;
    private m_Channel: Discord.TextChannel;

    constructor(a_Bot: Discord.Client, a_SettingsFile: string, a_DataFile: string) {
        this.m_Settings = fileBackedObject(a_SettingsFile);

        this.m_Data = fileBackedObject(a_DataFile);
        console.log("Successfully loaded TechblogReader data file.");

        this.m_Bot = a_Bot;

        this.m_Bot.on("ready", () => {
            if (!this.m_Data.Last) this.m_Data.Last = Date.now();

            const t_Guild = this.m_Bot.guilds.find("name", this.m_Settings.Server);
            if (!t_Guild) {
                console.error("Incorrect setting for the server: " + this.m_Settings.Server);
                return;
            }

            this.m_Channel = t_Guild.channels.find("name", this.m_Settings.Channel) as Discord.TextChannel;
            if (!this.m_Channel) {
                console.error("Incorrect setting for the channel: " + this.m_Settings.Channel);
                return;
            }

            console.log("TechblogReader extension loaded.");

            setInterval(() => {
                this.CheckFeed();
            }, this.m_Settings.CheckInterval);
        });
    }

    CheckFeed() {
        feedReader(this.m_Settings.URL, (a_Error, a_Articles) => {
            if (a_Error) {
                console.error("Error reading tech blog RSS feed:", a_Error);
                return;
            }

            for (let i = a_Articles.length - 1; i >= 0; i--) {
                const t_Article = a_Articles[i];
                const t_Timestamp = +t_Article.published;
                if (t_Timestamp > this.m_Data.Last) {
                    this.m_Channel.send(`A new article has been posted on the Riot Games Tech Blog: \`${t_Article.title}\`\n${t_Article.link}`);
                    this.m_Data.Last = t_Timestamp;
                }
            }
        });
    }
}
