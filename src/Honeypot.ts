import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

export default class Honeypot {
    private master: Discord.Client;
    private client: Discord.Client;
    private joinTime: number;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, personalSettings: PersonalSettings) {
        this.sharedSettings = sharedSettings;
        this.personalSettings = personalSettings;
        console.log("Successfully loaded honeypot settings.");

        this.joinTime = Date.now();
        this.master = bot;
        this.client = new Discord.Client();

        this.client
            .on("message", this.onMessage.bind(this))
            .on("messageUpdate", this.onMessageUpdate.bind(this))
            .on("guildCreate", this.onJoin.bind(this))
            .on("error", console.error)
            .on("warn", console.warn)
            // .on("debug", console.log)
            .on("disconnect", () => console.warn("Honeypot disconnected!"))
            .on("reconnecting", () => console.warn("Honeypot is reconnecting..."))
            .on("connect", () => console.warn("Honeypot is connected."))
            .on("ready", () => console.log("Honeypot is logged in and ready."));

        this.master.on("ready", () => {
            console.log("Honeypot's master is logged in and ready.");
            this.client.login(this.personalSettings.honeypot.token);
        });
    }

    private onJoin(guild: Discord.Guild) {
        console.error(`Joined '${guild}'`);
        this.joinTime = Date.now();
    }

    get joinedTime() {
        const timeDiff = Date.now() - this.joinTime;
        if (timeDiff > 1000) {
            return Math.round(timeDiff * 0.001) + " seconds";
        }

        return timeDiff + " milliseconds";
    }

    private onMessage(message: Discord.Message) {
        if (message.channel.type !== "dm") return;

        const catchMessage = `Got a direct message ${this.joinedTime} after joining from ${message.author.toString()}: \`\`\`${message.content}\`\`\``;
        this.reportHoneypotCatch(catchMessage);
    }

    private onMessageUpdate(oldMessage: Discord.Message, newMessage: Discord.Message) {
        if (newMessage.channel.type !== "dm") {
            return;
        }

        const catchMessage = `User updated a direct message ${this
            .joinedTime} after joining from ${newMessage.author.toString()}: \`\`\`${newMessage.content}\`\`\` Old message was: \`\`\`${oldMessage.content}\`\`\``;
        this.reportHoneypotCatch(catchMessage);
    }

    private reportHoneypotCatch(message: string) {
        console.warn(message);
        const channel = this.channel;
        if (!channel)  return;

        channel.send(message);
    }

    get channel(): Discord.TextChannel | null {
        const guild = this.master.guilds.find("name", this.sharedSettings.server);
        if (!guild) {
            console.error(`Honeypot: Incorrect setting for the server: ${this.sharedSettings.server}`);
            return null;
        }

        const channel = guild.channels.find("name", this.sharedSettings.honeypot.reportChannel);
        if (!channel) {
            console.error(`Honeypot: Incorrect setting for the channel: ${this.sharedSettings.honeypot.reportChannel}`);
            return null;
        }

        return channel as Discord.TextChannel;
    }
}
