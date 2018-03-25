import Discord = require("discord.js");

export abstract class CommandHandler {
    public abstract onReady(bot: Discord.Client): void;
    public abstract onCommand(message: Discord.Message, command: string, args: string[]): void;
}

export interface CommandHolder {
    command: Command;
    handler: CommandHandler;
    prefix: string;
}

export interface Command {
    aliases: string[];
    description: string;
    prefix: string;
}

export interface CommandList {
    botty: Command[];
    channelAccess: Command[];
    uptime: Command[];
    autoReact: Command[];
    info: Command[];
    officeHours: Command[];
    riotApiLibraries: Command[];
    apiStatus: Command[];
}
