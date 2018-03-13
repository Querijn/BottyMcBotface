import Discord = require("discord.js");

export abstract class CommandHandler {
    abstract onCommand(sender: Discord.User, channel: Discord.TextChannel, message: Discord.Message, command: string, args: string[]): void;
    abstract onReady(bot: Discord.Client): void;
}

export interface CommandBase {
    alias: string;
    handler: CommandHandler;
}