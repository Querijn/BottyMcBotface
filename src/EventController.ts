import Discord = require("discord.js");

type EventHandler = (bot: Discord.Client | Discord.Message | Discord.User) => void;

export class EventController {

    private events: Map<string, EventHandler[]> = new Map();
    private bot: Discord.Client;

    constructor(bot: Discord.Client) {
        this.bot = bot;
    }

    public registerHandler(event: string, handler: EventHandler) {
        let handlers = this.events.get(event);

        if (!handlers) {
            this.events.set(event, []);
            handlers = this.events.get(event);

            // could decorators make this cleaner?
            if (event === "ready") {
                this.bot.on(event, this.handleReady.bind(this));
            }
            if (event === "message") {
                this.bot.on(event, this.handleMessage.bind(this));
            }
            if (event === "guildMemberAdd") {
                this.bot.on(event, this.handleGuildMemberAdd.bind(this));
            }
            if (event === "guildMemberRemove") {
                this.bot.on(event, this.handleGuildMemberRemove.bind(this));
            }
            if (event === "guildMemberUpdate") {
                this.bot.on(event, this.handleGuildMemberUpdate.bind(this));
            }

        }

        handlers!.push(handler);
    }

    private handleReady() {
        this.events.get("ready")!.forEach(handler => {
            handler.call(null, this.bot);
        });
    }

    private handleMessage(message: Discord.Message) {
        this.events.get("message")!.forEach(handler => {
            handler.call(null, message);
        });
    }

    private handleGuildMemberAdd(member: Discord.GuildMember) {
        this.events.get("guildMemberAdd")!.forEach(handler => {
            handler.call(null, member);
        });
    }

    private handleGuildMemberRemove(member: Discord.GuildMember) {
        this.events.get("guildMemberRemove")!.forEach(handler => {
            handler.call(null, member);
        });
    }

    private handleGuildMemberUpdate(oldMember: Discord.GuildMember, newMember: Discord.GuildMember) {
        this.events.get("guildMemberRemove")!.forEach(handler => {
            handler.call(null, oldMember, newMember);
        });
    }
}
