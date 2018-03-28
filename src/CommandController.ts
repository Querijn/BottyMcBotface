import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";

export interface CommandHandler {
    onReady(bot: Discord.Client): void;
    onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]): void;
}

export interface SingleCommand {
    onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]): void;
}

export interface CommandHolder {
    command: Command;
    handler: (CommandHandler | SingleCommand);
    status: CommandStatus;
    prefix: string;
}

enum CommandStatus {
    ENABLED, DISABLED,
}

export interface Command {
    aliases: string[];
    description: string;
    prefix: string;
    admin: boolean;
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

export default class CommandController {

    private sharedSettings: SharedSettings;
    private commands: CommandHolder[] = [];
    private client: Discord.Client;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.client = bot;

        bot.on("message", this.handleCommands.bind(this));

        this.registerCommand([
            {
                aliases: ["help"],
                description: "Prints all the commands",
            },
        ] as Command[], { onCommand: this.onHelp } as SingleCommand);

        this.registerCommand([
            {
                admin: true,
                aliases: ["toggle_command"],
                description: "Enables or disables commands (!toggle_command {command})",
            },
        ] as Command[], { onCommand: this.onToggle } as SingleCommand);
    }

    public onToggle(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length !== 1) return;

        const filtered = this.commands.filter(handler => handler.command.aliases.some(alias => alias === args[0]));
        filtered.forEach(handler => handler.status = (handler.status === CommandStatus.ENABLED ? CommandStatus.DISABLED : CommandStatus.ENABLED));
    }

    public onHelp(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        let response = "\n";

        const toString = (holder: CommandHolder) => {

            let str = "";

            if (holder.status === CommandStatus.DISABLED) {
                str += "~~";
            }

            str += `\`${holder.prefix}${holder.command.aliases}\``;

            if (holder.status === CommandStatus.DISABLED) {
                str += "~~";
            }

            str += `: ${holder.command.description}\n`;

            return str;
        };

        this.commands
            // ignore "*" commands
            .filter(holder => holder.command.aliases.some(a => a !== "*"))
            // hide admin commands if not admin
            .filter(holder => isAdmin || !holder.command.admin)
            .forEach(holder => response += toString(holder));

        message.reply(response);
    }

    public registerCommand(newCommand: Command[], commandHandler: (CommandHandler | SingleCommand)) {
        newCommand.forEach(cmd => {
            this.commands.push({
                command: cmd,
                handler: commandHandler,
                prefix: cmd.prefix || this.sharedSettings.botty.prefix,
                status: CommandStatus.ENABLED,
            });
        });

        if (this.isHandler(commandHandler)) {
            commandHandler.onReady(this.client);
        }
    }

    private isHandler(handler: any): handler is CommandHandler {
        return handler.onReady !== undefined;
    }

    private handleCommands(message: Discord.Message) {
        if (message.author.bot) return;

        const parts = message.content.split(" ");
        const prefix = parts[0][0];
        const command = parts[0].substr(1);
        const isAdmin = (message.member && this.sharedSettings.commands.adminRoles.some(x => message.member.roles.has(x)));

        this.commands.forEach(holder => {
            if (holder.status === CommandStatus.DISABLED) return;
            if (holder.prefix === prefix) {

                // handlers that register the "*" command will get all commands with that prefix (unless they already have gotten it once)
                if (holder.command.aliases.some(x => x === command)) {
                    holder.handler.onCommand(message, isAdmin, command, parts.slice(1));
                    return;
                }

                if (holder.command.aliases.some(x => x === "*")) {
                    holder.handler.onCommand(message, isAdmin, "*", Array<string>().concat(command, parts.slice(1)));
                }
            }
        });
    }
}
