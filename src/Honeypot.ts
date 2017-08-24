import { fileBackedObject } from "./util";
import Discord = require("discord.js");

export interface HoneypotSettings {
    Discord: {
        Token: string;
        Owner: string;
    };
    Server: string;
    ReportChannel: string;
}

export default class Honeypot {
    private master: Discord.Client;
    private client: Discord.Client;
    private joinTime: number;
    private settings: HoneypotSettings;

    constructor(bot: Discord.Client, settingsFile: string) {
        this.settings = fileBackedObject(settingsFile);
        console.log("Successfully loaded honeypot settings file.");

        this.joinTime = Date.now();
        this.master = bot;
        this.client = new Discord.Client();

        this.client
            .on("message", this.onMessage.bind(this))
            .on("messageUpdate", this.onMessageUpdate.bind(this))
            .on("guildCreate", this.onJoin.bind(this))
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
            .on("disconnect", () => console.warn("Honeypot disconnected!"))
            .on("reconnecting", () => console.warn("Honeypot is reconnecting..."))
            .on("connect", () => console.warn("Honeypot is connected."))
            .on("ready", () => console.log("Honeypot is logged in and ready."));

        this.master.on("ready", () => {
            console.log("Honeypot's master is logged in and ready.");
            this.client.login(this.settings.Discord.Token);
        });
    }

    onJoin(guild: Discord.Guild) {
        console.error(`Joined '${guild}'`);
        this.joinTime = Date.now();
    }

    get joinedTime() {
        const timeDiff = Date.now() - this.joinTime;
        if (timeDiff > 1000) return Math.round(timeDiff * 0.001) + " seconds";

        return timeDiff + " milliseconds";
    }

    onMessage(message: Discord.Message) {
        if (message.channel.type !== "dm") return;

        const catchMessage = `Got a direct message ${this.joinedTime} after joining from ${message.author.toString()}: \`\`\`${message.content}\`\`\``;
        this.reportHoneypotCatch(catchMessage);
    }

    onMessageUpdate(oldMessage: Discord.Message, newMessage: Discord.Message) {
        if (newMessage.channel.type !== "dm") return;

        const catchMessage = `User updated a direct message ${this
            .joinedTime} after joining from ${newMessage.author.toString()}: \`\`\`${newMessage.content}\`\`\` Old message was: \`\`\`${oldMessage.content}\`\`\``;
        this.reportHoneypotCatch(catchMessage);
    }

    reportHoneypotCatch(message: string) {
        console.warn(message);
        const channel = this.channel;
        if (!channel) return;

        channel.send(message);
    }

    get channel(): Discord.TextChannel | null {
        const guild = this.master.guilds.find("name", this.settings.Server);
        if (!guild) {
            console.error(`Incorrect setting for the server: ${this.settings.Server}`);
            return null;
        }

        const channel = guild.channels.find("name", this.settings.ReportChannel);
        if (!channel) {
            console.error(`Incorrect setting for the channel: ${this.settings.ReportChannel}`);
            return null;
        }

        return channel as Discord.TextChannel;
    }
}
