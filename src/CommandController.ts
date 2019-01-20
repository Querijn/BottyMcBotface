import Discord = require("discord.js");
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import url = require("url");

type SingleCommand = (message: Discord.Message, isAdmin: boolean, command: string, args: string[]) => void;

export interface CommandHolder {
    identifier: string;
    command: Command;
    handler: SingleCommand;
    prefix: string;
    cooldown: number;
    lastUsed: number;
}

enum CommandStatus {
    ENABLED = 1, DISABLED = 0,
}

export interface Command {
    aliases: string[];
    description: string;
    prefix: string;
    admin: boolean;
    cooldown: number;
}

export interface CommandList {
    controller: {
        toggle: Command;
        help: Command;
    };
    esports: {
        date: Command;
        pickem: Command;
    };
    games: {
        ttt: Command;
    };
    botty: {
        restart: Command;
    };
    apiSchema: {
        updateSchema: Command;
    };
    keyFinder: Command;
    welcome: Command;
    uptime: Command;
    autoReact: {
        toggle_default_thinking: Command;
        toggle_react: Command;
        refresh_thinking: Command;
    };
    info: {
        all: Command,
        note: Command,
    };
    officeHours: {
        open: Command;
        close: Command;
        ask: Command;
        ask_for: Command;
    };
    riotApiLibraries: Command;
    apiStatus: Command;
    endpointManager: {
        endpoint: Command;
        endpoints: Command;
    };
}

export default class CommandController {

    private sharedSettings: SharedSettings;
    private commands: CommandHolder[] = [];
    private commandStatuses: { [commandName: string]: CommandStatus } = {};
    private client: Discord.Client;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, commandData: string) {
        this.sharedSettings = sharedSettings;
        this.client = bot;

        this.commandStatuses = fileBackedObject(commandData, "www/" + commandData);

        bot.on("message", this.handleCommands.bind(this));
    }

    public onToggle(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length !== 1) return;

        const filtered = this.commands.filter(handler => handler.command.aliases.some(alias => handler.prefix + alias === args[0]));
        if (filtered.length === 0) {
            message.channel.send(`No command with the name ${args[0]} was found.`);
            return;
        }

        for (const handler of filtered) {
            this.commandStatuses[handler.identifier] = (this.getStatus(handler) === CommandStatus.DISABLED ? CommandStatus.ENABLED : CommandStatus.DISABLED);
            message.channel.send(`${handler.prefix + handler.command.aliases.join("/")} is now ${this.getStatus(handler) === CommandStatus.ENABLED ? "enabled" : "disabled"}.`);
        }
    }

    public getHelp(isAdmin: boolean = false): Discord.RichEmbed[] {
        const toString = (holder: CommandHolder) => {

            let title = "";
            let desc = "";

            if (this.getStatus(holder) === CommandStatus.DISABLED) {
                title += "~~";
            }

            title += `\`${holder.prefix}${holder.command.aliases}\``;

            if (this.getStatus(holder) === CommandStatus.DISABLED) {
                title += "~~";
            }

            desc += `${holder.command.description}`;
            if (this.getStatus(holder) === CommandStatus.DISABLED) {
                desc += " (command is disabled)";
            }

            return { title, desc };
        };

        const mapped = this.commands
            // ignore "*" commands
            .filter(holder => holder.command.aliases.some(a => a !== "*"))
            // hide admin commands if not admin
            .filter(holder => isAdmin || !holder.command.admin)
            .map(holder => toString(holder))
            .sort((a, b) => a.title.localeCompare(b.title));

        const data: Discord.RichEmbed[] = [];
        let pageIndex = 0;
        let embed: Discord.RichEmbed;

        for (let i = 0; i < mapped.length; i++) {
            // rich embeds have a 25 field limit
            if (i % 25 === 0) {
                embed = new Discord.RichEmbed({ title: `Commands (page ${++pageIndex})` });
                data.push(embed);
            }

            embed!.addField(mapped[i].title, mapped[i].desc);
        }
        return data;
    }

    public onHelp(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (args[0] !== "here") {
            message.channel.send(`An introduction to Botty can be found here: ${this.sharedSettings.botty.webServer.relativeLiveLocation}\nYou can find all commands to use here: ${url.resolve(this.sharedSettings.botty.webServer.relativeLiveLocation, "commands")}`);
            return;
        }

        const data = this.getHelp(isAdmin);
        data.forEach(embed => message.channel.send({ embed }));
    }

    public registerCommand(newCommand: Command, commandHandler: SingleCommand) {
        this.commands.push({
            identifier: commandHandler.name,
            command: newCommand,
            cooldown: newCommand.cooldown || 0,
            handler: commandHandler,
            prefix: newCommand.prefix || this.sharedSettings.commands.default_prefix,
            lastUsed: 0,
        });
    }

    private handleCommands(message: Discord.Message) {
        if (message.author.bot) return;

        const parts = message.content.split(" ");
        const prefix = parts[0][0];
        const command = parts[0].substr(1);
        const isAdmin = (message.member && this.sharedSettings.commands.adminRoles.some(x => message.member.roles.has(x)));

        this.commands.forEach(holder => {

            if (this.getStatus(holder) === CommandStatus.DISABLED) return;
            if (holder.command.admin && !isAdmin) return;
            if (holder.prefix !== prefix) return;

            // handlers that register the "*" command will get all commands with that prefix (unless they already have gotten it once)

            const args = parts.slice(1).filter(a => a !== "");
            if (holder.command.aliases.some(x => x === command)) {
                if (this.checkCooldown(holder, message)) {
                    holder.handler.call(null, message, isAdmin, command, args);
                }
            } else if (holder.command.aliases.some(x => x === "*")) {
                if (this.checkCooldown(holder, message)) {
                    holder.handler.call(null, message, isAdmin, "*", Array<string>().concat(command, args));
                }
            }
        });
    }

    private checkCooldown(holder: CommandHolder, message: Discord.Message): boolean {
        if (!holder.cooldown) return true;

        const last = holder.lastUsed;
        const wait = holder.cooldown;
        const now = Date.now();
        const remaining = last + wait - now;

        if (remaining > 0) {
            message.channel.send(`This command is currently on cooldown. (${Math.floor(remaining / 1000)} seconds remaining)`);
            return false;
        }

        holder.lastUsed = now;
        return true;
    }

    private getStatus(holder: CommandHolder): CommandStatus {
        return this.commandStatuses[holder.identifier];
    }
}
