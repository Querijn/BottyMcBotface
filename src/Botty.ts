import { Command, CommandHandler, CommandHolder } from "./CommandHandler";
import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import { GuildMember } from "discord.js";

export interface BottySettings {
    Discord: {
        Key: string;
        Owner: number;
    };
}

export default class Botty extends CommandHandler {
    public readonly client = new Discord.Client();
    private personalSettings: PersonalSettings;
    private sharedSettings: SharedSettings;
    private commands: CommandHolder[] = [];

    constructor(personalSettings: PersonalSettings, sharedSettings: SharedSettings) {
        super();
        this.personalSettings = personalSettings;
        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded bot settings.");

        this.client
            .on("error", console.error)
            .on("warn", console.warn)
            // .on("debug", console.log)
            .on("disconnect", () => console.warn("Disconnected!"))
            .on("reconnecting", () => console.log("Reconnecting..."))
            .on("message", this.handleCommands.bind(this))
            .on("connect", () => console.log("Connected."))
            .on("ready", this.onConnect.bind(this));

        this.initListeners();
    }

    public start() {
        return this.client.login(this.personalSettings.discord.key);
    }

    public onReady(bot: Discord.Client) {
        console.log("Successfully loaded botty commands.");
        return;
    }

    // Help command
    public onCommand(message: Discord.Message, command: string, args: string[]) {
        let response = "\n";

        // ignore "*" commands
        this.commands.filter(holder => holder.command.aliases.some(a => a !== "*"))
            .forEach(holder => response += `**${holder.prefix}${holder.command.aliases}**: ${holder.command.description}\n`);

        message.channel.send(response);
    }

    public registerCommand(newCommand: Command[], commandHandler: CommandHandler) {
        newCommand.forEach(cmd => {
            this.commands.push({
                command: cmd,
                handler: commandHandler,
                prefix: cmd.prefix || this.sharedSettings.botty.prefix,
            });
        });

        commandHandler.onReady(this.client);
    }

    private initListeners() {
        this.client.on("guildMemberAdd", user => console.log(`${user.displayName} joined the server.`));

        this.client.on("guildMemberRemove", user => console.log(`${user.displayName} left (or was removed) from the server.`));

        this.client.on("guildMemberUpdate", (oldMember: GuildMember, newMember: GuildMember) => {

            if (oldMember.displayName !== newMember.displayName) {
                console.log(`${oldMember.displayName} changed his display name to ${newMember.displayName}.`);
            }

            if (oldMember.nickname !== newMember.nickname) {
                console.log(`${oldMember.nickname} changed his nickname to ${newMember.nickname}.`);
            }

            if (oldMember.user.avatarURL !== newMember.user.avatarURL) {
                console.log(`${oldMember.displayName} changed his avatar from ${oldMember.user.avatarURL} to ${newMember.user.avatarURL}.`);
            }

            if (oldMember.user.discriminator !== newMember.user.discriminator) {
                console.log(`${oldMember.displayName} changed his discriminator from ${oldMember.user.discriminator} to ${newMember.user.discriminator}.`);
            }

            const oldGame = oldMember.user.presence && oldMember.user.presence.game ? oldMember.user.presence.game.name : "nothing";
            const newGame = newMember.user.presence && newMember.user.presence.game ? newMember.user.presence.game.name : "nothing";
            if (oldGame !== newGame) {
                console.log(`${oldMember.displayName} is now playing ${newGame} (was ${oldGame}).`);
            }

            const oldStatus = (oldMember.user.presence && oldMember.user.presence.status) ? oldMember.user.presence.status : "offline (undefined)";
            const newStatus = (newMember.user.presence && newMember.user.presence.status) ? newMember.user.presence.status : "offline (undefined)";
            if (oldStatus !== newStatus && (newStatus === "offline" || newStatus === "online")) {
                console.log(`${oldMember.displayName} is now ${newStatus} (was ${oldStatus}).`);
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
        if (this.personalSettings.isProduction) guild.me.setNickname(this.sharedSettings.botty.nickname);
        else guild.me.setNickname("");
    }

    private handleCommands(message: Discord.Message) {
        if (message.author.bot) return;

        const parts = message.content.split(" ");
        const prefix = parts[0][0];
        const command = parts[0].substr(1);

        this.commands.forEach(holder => {
            if (holder.prefix === prefix) {

                // handlers that register the "*" command will get all commands with that prefix (unless they already have gotten it once)
                if (holder.command.aliases.some(x => x === command)) {
                    holder.handler.onCommand(message, command, parts.slice(1));
                    return;
                }

                if (holder.command.aliases.some(x => x === "*")) {
                    holder.handler.onCommand(message, "*", Array<string>().concat(command, parts.slice(1)));
                }
            }
        });
    }

}
