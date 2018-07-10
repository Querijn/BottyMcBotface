import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings, SharedSettings } from "./SharedSettings";
import levenshteinDistance from "./LevenshteinDistance";

import Discord = require("discord.js");
import { GuildMember } from "discord.js";

import { exec } from "child_process";

export interface BottySettings {
    Discord: {
        Key: string;
        Owner: number;
    };
}

export default class Botty {
    public readonly client = new Discord.Client();
    private personalSettings: PersonalSettings;
    private sharedSettings: SharedSettings;

    constructor(sharedSettings: SharedSettings) {
        this.personalSettings = sharedSettings.botty;
        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded bot settings.");

        this.client
            .on("error", console.error)
            .on("warn", console.warn)
            // .on("debug", console.log)
            .on("disconnect", () => console.log("Disconnected!"))
            .on("reconnecting", () => console.log("Reconnecting..."))
            .on("connect", () => console.log("Connected."))
            .on("ready", this.onConnect.bind(this));

        this.initListeners();
    }

    public start() {
        return this.client.login(this.personalSettings.discord.key);
    }

    public async onRestart(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (!isAdmin) return;

        await message.channel.send("Restarting...");
        exec("pm2 restart .", (err, stdout, stderr) => {
            if (err) {
                console.error(err.message);
                return;
            }

            if (stdout.length !== 0) console.log(`onRestart: ${stdout}`);
            if (stderr.length !== 0) console.error(`onRestart: ${stderr}`);
        });
    }

    private initListeners() {
        this.client.on("guildMemberAdd", user => console.log(`${user.displayName} joined the server.`));

        this.client.on("guildMemberRemove", user => console.log(`${user.displayName} left (or was removed) from the server.`));

        this.client.on("guildBanAdd", (guild: Discord.Guild, user: Discord.User) => console.log(`${user.username} (${user.id}) has been banned from ${guild.name}.`));
        this.client.on("guildBanRemove", (guild: Discord.Guild, user: Discord.User) => console.log(`${user.username} (${user.id}) has been unbanned from ${guild.name}.`));
        
        this.client.on("messageDelete", (message: Discord.Message) => {
            
            if (message.author.bot) return; // Ignore bot in general
            if (message.channel.type == "dm" || message.channel.type == "group") return; // Don't output DMs

            console.log(`${message.author.username}'s message in ${message.channel} was deleted. Contents: \`\`\`${message.content}\`\`\``)
        });

        this.client.on("messageUpdate", (oldMessage: Discord.Message, newMessage: Discord.Message) => {
            
            if (levenshteinDistance(oldMessage.content, newMessage.content) == 0) return; // To prevent page turning and embed loading to appear in changelog
            if (oldMessage.author.bot) return; // Ignore bot in general
            if (oldMessage.channel.type == "dm" || oldMessage.channel.type == "group") return; // Don't output DMs

            console.log(`${oldMessage.author.username}'s message in ${oldMessage.channel} was changed from: \`\`\`${oldMessage.content}\`\`\` To: \`\`\`${newMessage.content}\`\`\``)
        });

        this.client.on("guildMemberUpdate", (oldMember: GuildMember, newMember: GuildMember) => {

            if (oldMember.displayName !== newMember.displayName) {
                console.log(`${oldMember.displayName} changed his display name to ${newMember.displayName}.`);
            }

            if (oldMember.nickname !== newMember.nickname) {
                console.log(`${oldMember.nickname} changed his nickname to ${newMember.nickname}.`);
            }

            if (oldMember.user.discriminator !== newMember.user.discriminator) {
                console.log(`${oldMember.displayName} changed his discriminator from ${oldMember.user.discriminator} to ${newMember.user.discriminator}.`);
            }
        });
        console.log("Initialised listeners.");
    }

    private onConnect() {
        console.log("Bot is logged in and ready.");

        const guild = this.client.guilds.get(this.sharedSettings.server);
        if (!guild) {
            console.error(`Botty: Incorrect setting for the server: ${this.sharedSettings.server}`);
            return;
        }

        // Set correct nickname
        if (guild.me) {
            guild.me.setNickname(this.personalSettings.isProduction ? "Botty McBotface" : "");
        }
    }

}
