import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";
import Botty from "./Botty";
import EventEmitter = require('events');

export interface InteractionCommandData {
    body: Discord.RESTPatchAPIApplicationCommandJSONBody,
    global?: boolean | true | false, // wtf?
    adminOnly: false | true,
    handler: BottyCommandInteraction,
};
export type BottyCommandInteraction = (interaction: Discord.CommandInteraction | Discord.AutocompleteInteraction, admin?: false | true) => any;
export interface InteractionInterface {
    getInteractionCommands() : InteractionCommandData[]
}

export default class InteractionManager {
    private initialized: true | false | "failed" = false;
    private initializePromise: Promise<void>;
    private clientId: string;
    private sharedSettings: SharedSettings;
    private rest: Discord.REST;
    private globalCommands: Discord.RESTGetAPIApplicationCommandsResult;
    private handlers = new Map<string, InteractionCommandData>(); // Commands by id
    private commands: InteractionCommandData[] = []; // Commands by name
    private botty: Botty;

    public constructor(botty: Botty, settings: SharedSettings) {
        this.botty = botty;
        this.rest = new Discord.REST().setToken(settings.botty.discord.key);
        this.sharedSettings = settings;
        //this.clientId = this.sharedSettings.botty.discord.clientId;

        //botty.client.on("ready", this.initialize.bind(this));
        this.initializePromise = this.initialize().catch(console.error);
        botty.client.on("interactionCreate", this.onInteraction.bind(this));
    }

    private async initialize()
    {
        if (!this.clientId) {
            console.warn("InteractionManager: Client ID not set in shared_settings.json, will try to use user id");
            // Wait until connected to discord to continue
            if (!this.botty.client.readyAt) await new Promise((resolve) => this.botty.client.once('ready', resolve));
            if (this.botty.client.user && this.botty.client.user.id) this.clientId = this.botty.client.user.id
        }
        const adminCommands = [
            new Discord.SlashCommandBuilder()
            .setName("refresh_commands")
            .setDescription("Refreshes all slash commands").toJSON()
        ];

        // Find global commands
        this.globalCommands = await this.rest.get(Discord.Routes.applicationCommands(this.clientId)) as Discord.RESTGetAPIApplicationCommandsResult;
        this.initialized = true;
        // Add admin commands related to interaction manager
        for (const adminCommand of adminCommands) {
            this.addSlashCommand(adminCommand, true, true, this.onInteraction.bind(this))
        }
    }

    public async addSlashCommand(command: Discord.RESTPostAPIChatInputApplicationCommandsJSONBody | Discord.RESTPatchAPIApplicationCommandJSONBody, global: boolean, adminOnly: boolean, handler: BottyCommandInteraction): Promise<void> {
        const commandData: InteractionCommandData = {body: command, global, adminOnly, handler};
        this.commands.push(commandData);
        if (!this.initialized) await this.initializePromise;
        if (this.initialized === "failed") throw new Error("Cannot add new command because InteractionManager failed to load");
        if (commandData.global) {
            // Check if command is already registered
            const restCommand = this.globalCommands.find((c) => c.name === commandData.body.name)
            if (restCommand) this.handlers.set(restCommand.id, commandData) // Already was registered
            else this.handlers.set(await this.addGlobalSlashCommandREST(commandData), commandData)
            return;
        }
    }

    private async addGlobalSlashCommandREST(command: InteractionCommandData) {
        return (await (this.rest.post(Discord.Routes.applicationCommands(this.clientId), {body: command.body})) as Discord.APIApplicationCommand).id
    }

    public onRefresh(interaction: Discord.CommandInteraction, admin = false) {
        if (interaction.commandName !== "refresh_commands") { return; }
        if (!admin) interaction.reply({content: "You don't have permission to use this command", ephemeral: true});

        this.rest.put(Discord.Routes.applicationCommands(this.clientId), {body: []}).then(() => {
            this.handlers.clear();
            const localCommands = this.commands
            this.commands = [];
            localCommands.forEach(this.addSlashCommand.bind(this));
            interaction.reply({content: "Done", ephemeral: true});
        }).catch(e => interaction.reply({content: "Failed to refresh commands: " + e, ephemeral: true}));
    }

    public onInteraction(interaction: Discord.BaseInteraction) {
        let admin = false;
        if (interaction.guild) {
            const member = interaction.guild.members.cache.find(guildMember => interaction.user.id === guildMember.user.id)
            admin = member?.roles.cache.some((role) => this.sharedSettings.commands.adminRoles.includes(role.id)) || false;
        }
        if (interaction instanceof Discord.CommandInteraction) {
            const handler = this.handlers.get(interaction.commandId);
            // Interactions from REST probably aren't loaded, fall back to using name for now
            if (handler === undefined) {
                const possibleInteraction = this.findInteractionByName(interaction.commandName);
                console.warn("InteractionManager: Interaction requested, but in a funky state");
                try {
                    possibleInteraction?.handler(interaction, admin);
                }
                catch (e) {
                    if (!interaction.replied) interaction.reply({content: "The command returned an error", ephemeral: true});
                    console.error(e);
                }
                return;
            }
            try {
                handler.handler(interaction, admin as any);
            }
            catch (e) {
                interaction.reply({content: "The command returned an error", ephemeral: true});
                console.error(e);
            }
        }
        else if (interaction instanceof Discord.AutocompleteInteraction) {
            const handler = this.handlers.get(interaction.commandId);
            handler?.handler(interaction, admin);
        }
    }
    private findInteractionByName(name: string) {
        return this.commands.find(c => c.body.name === name);
    }
}