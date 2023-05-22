import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings, SharedSettings } from "./SharedSettings";
import { levenshteinDistance } from "./LevenshteinDistance";

import Discord = require("discord.js");
import { GatewayIntentBits, GuildMember } from "discord.js";

import { exec } from "child_process";

export interface BottySettings {
    Discord: {
        Key: string;
        Owner: number;
    };
}

export default class Botty {
    public readonly client = new Discord.Client({ intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
    ]});
    private personalSettings: PersonalSettings;
    private sharedSettings: SharedSettings;

    constructor(sharedSettings: SharedSettings) {
        this.personalSettings = sharedSettings.botty;
        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded bot settings.");
        this.client.setMaxListeners(25);

        this.client
            .on("error", console.error)
            .on("warn", console.warn)
            // .on("debug", console.log)
            .on("ready", this.onConnect.bind(this));

        this.initListeners();
    }

    public start() {
        return this.client.login(this.personalSettings.discord.key);
    }

    public async onRestart(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (!isAdmin) return;

        await message.channel.send("Restarting...");
        exec("pm2 restart " + this.personalSettings.appName, (err, stdout, stderr) => {
            if (err) {
                console.error(err.message);
                return;
            }

            if (stdout.length !== 0) console.log(`onRestart: ${stdout}`);
            if (stderr.length !== 0) console.error(`onRestart: ${stderr}`);
        });
    }

    private initListeners() {
        this.client.on("guildMemberAdd", member => console.log(`${member.displayName}#${member.user?.discriminator} (${member.id}) joined the server.`));
        this.client.on("guildMemberRemove", member => console.log(`${member.displayName}#${member.user?.discriminator} (${member.id}) left (or was removed) from the server.`));

        this.client.on("guildBanAdd", (guildBan: Discord.GuildBan) => console.log(`${guildBan.user.username}#${guildBan.user.discriminator} (${guildBan.user.id}) has been banned from ${guildBan.guild.name}.`));
        this.client.on("guildBanRemove", (guildBan: Discord.GuildBan) => console.log(`${guildBan.user.username}#${guildBan.user.discriminator} (${guildBan.user.id}) has been unbanned from ${guildBan.guild.name}.`));

        this.client.on("messageDelete", (message: Discord.Message) => {

            if (message.author.bot) return; // Ignore bot in general
            if (message.channel.type === Discord.ChannelType.DM) return; // Don't output DMs

            console.log(`${message.author.username}'s (${message.author.id}) message in ${message.channel} was deleted. Contents: \n${message.cleanContent}\n`);
        });

        this.client.on('voiceStateUpdate', (oldMember, newMember) => {
            let newUserChannel = newMember.channel;
            let oldUserChannel = oldMember.channel;

            let member = newMember.member || oldMember.member;

            if (newUserChannel) {
                console.log(`${member?.user.username}'s (${oldMember.id}) joined voice channel ${newUserChannel}\n`);
            }
            if (oldUserChannel) {
                console.log(`${member?.user.username}'s (${oldMember.id}) left voice channel ${oldUserChannel}\n`);
            }
        });

        this.client.on("messageUpdate", (oldMessage: Discord.Message, newMessage: Discord.Message) => {

            if (levenshteinDistance(oldMessage.content, newMessage.content) === 0) return; // To prevent page turning and embed loading to appear in changelog
            if (oldMessage.author.bot) return; // Ignore bot in general
            if (oldMessage.channel.type === Discord.ChannelType.DM) return; // Don't output DMs

            console.log(`${oldMessage.author.username}'s message in ${oldMessage.channel} was changed from: \n${oldMessage.cleanContent}\n\nTo:\n${newMessage.cleanContent}`);
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

        const guild = this.client.guilds.cache.get(this.sharedSettings.server.guildId);
        if (!guild) {
            console.error(`Botty: Incorrect setting for the server: ${this.sharedSettings.server}`);

            const guilds = this.client.guilds.cache.map(g => ` - ${g.name} (${g.id})\n`);
            console.error(`The available guilds are:\n${guilds}`);
            return;
        }

        // Set correct nickname
        if (guild.members.me) {
            guild.members.me.setNickname(this.personalSettings.isProduction ? "Botty McBotface" : "");
        }
    }

}
