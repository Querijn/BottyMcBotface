import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";
import { CommandHandler, CommandBase } from "./CommandHandler";

import Discord = require("discord.js");
import { GuildMember } from "discord.js";

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
    private commands: CommandBase[] = [];

    constructor(personalSettings: PersonalSettings, sharedSettings: SharedSettings) {
        this.personalSettings = personalSettings;
        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded bot settings.");

        this.client
            .on("error", console.error)
            .on("warn", console.warn)
            //.on("debug", console.log)
            .on("disconnect", () => console.warn("Disconnected!"))
            .on("reconnecting", () => console.warn("Reconnecting..."))
            .on("message", this.handleCommands.bind(this))
            .on("connect", () => console.warn("Connected."))
            .on("ready", this.onConnect.bind(this));

        this.initListeners();
    }

    initListeners() {
        this.client.on("guildMemberAdd", function (user: GuildMember) {
            console.log(`${user.displayName} joined the server.`);
        }.bind(this));

        this.client.on("guildMemberRemove", function (user: GuildMember) {
            console.log(`${user.displayName} left (or was removed) from the server.`);
        }.bind(this));

        this.client.on("guildMemberUpdate", function (oldMember: GuildMember, newMember: GuildMember) {

            if (oldMember.displayName != newMember.displayName)
                console.log(`${oldMember.displayName} changed his display name to ${newMember.displayName}.`);

            if (oldMember.nickname != newMember.nickname)
                console.log(`${oldMember.nickname} changed his nickname to ${newMember.nickname}.`);

            if (oldMember.user.avatarURL != newMember.user.avatarURL)
                console.log(`${oldMember.displayName} changed his avatar from ${oldMember.user.avatarURL} to ${newMember.user.avatarURL}.`);

            if (oldMember.user.discriminator != newMember.user.discriminator)
                console.log(`${oldMember.displayName} changed his discriminator from ${oldMember.user.discriminator} to ${newMember.user.discriminator}.`);

            const oldGame = oldMember.user.presence && oldMember.user.presence.game ? oldMember.user.presence.game.name : "nothing";
            const newGame = newMember.user.presence && newMember.user.presence.game ? newMember.user.presence.game.name : "nothing";
            if (oldGame != newGame) console.log(`${oldMember.displayName} is now playing ${newGame} (was ${oldGame}).`);

            const oldStatus = (oldMember.user.presence && oldMember.user.presence.status) ? oldMember.user.presence.status : "offline (undefined)";
            const newStatus = (newMember.user.presence && newMember.user.presence.status) ? newMember.user.presence.status : "offline (undefined)";
            if (oldStatus != newStatus && (newStatus == "offline" || newStatus == "online")) console.log(`${oldMember.displayName} is now ${newStatus} (was ${oldStatus}).`);

        }.bind(this));
        console.log("Initialised listeners.");
    }

    onConnect() {
        console.log("Bot is logged in and ready.");

        const guild = this.client.guilds.get(this.sharedSettings.server);
        if (!guild) {
            console.error(`Botty: Incorrect setting for the server: ${this.sharedSettings.server}`);
            return;
        }

        // Set correct nickname
        if (this.personalSettings.isProduction)
            guild.me.setNickname("Botty McBotface");
        else guild.me.setNickname("");
    }

    start() {
        return this.client.login(this.personalSettings.discord.key);
    }

    handleCommands(message: Discord.Message) {

        if (message.author.bot) return;
        if (!message.content.startsWith(this.sharedSettings.botty.prefix)) return;

        const parts = message.content.split(" ");
        const command = parts[0].substr(1);

        this.commands.forEach(cmd => {
            if (cmd.alias === command) {
                cmd.handler.onCommand(message, command, parts.slice(1));
            }
        });
    }

    registerCommand(aliases: string[], commandHandler: CommandHandler) {
        aliases.forEach(a => {
            this.commands.push({
                alias: a,
                handler: commandHandler
            });
        });

        commandHandler.onReady(this.client);
    }
}
