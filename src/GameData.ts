import fetch from "node-fetch";
import Discord = require("discord.js");
import { levenshteinDistance, levenshteinDistanceArray } from "./LevenshteinDistance";
import { SharedSettings } from "./SharedSettings";

interface ChampionData {
    id: number;
    name: string;
    key: string;
    skins: SkinData[];
}

interface SkinData {
    id: number;
    name: string;
    splashPath: string;
    uncenteredSplashPath: string;
    tilePath: string;
    loadscreenPath: string;
    chromas: ChromaData[];
}

interface ChromaData {
    id: number;
    name: string;
    chromaPath: string;
    colors: string[];
}

interface PerkData {
    id: number;
    name: string;
    shortDesc: string;
    iconPath: string;
    endOfGameStatDescs: string[];
}

interface ItemData {
    id: number;
    name: string;
    categories: string[];
    price: number;
    priceTotal: number;
    iconPath: number;
    from: string[];
    to: string[];
}

export default class GameData {

    private champData: ChampionData[];
    private perkData: PerkData[];
    private itemData: ItemData[];

    private bot: Discord.Client;
    private sharedSettings: SharedSettings;

    public constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.sharedSettings = settings;

        bot.on("ready", async () => {
            this.reloadData();
            setInterval(this.reloadData, this.sharedSettings.lookup.refreshTimeout);
        });
    }

    public async reloadData() {
        this.champData = await this.loadChampionData();
        this.perkData = await this.loadPerkData();
        this.itemData = await this.loadItemData();
        console.log("Game data loaded!");
    }

    public async loadChampionData(): Promise<ChampionData[]> {
        const champions = await fetch(this.sharedSettings.lookup.championUrl).then(x => x.json());

        const returnData: ChampionData[] = champions
            .filter((c: any) => c.id > 0)
            .map((c: any) => ({
                id: c.id,
                name: c.name,
                key: c.alias,
                skins: [],
            }));

        const skins = await this.loadSkinData();
        for (const champion of returnData) {
            champion.skins = skins.filter(x => Math.floor(x.id / 1000) === champion.id);
        }

        return returnData;
    }

    public async loadSkinData(): Promise<SkinData[]> {
        return Object.values(await fetch(this.sharedSettings.lookup.skinUrl).then(x => x.json())) as SkinData[];
    }

    public async loadPerkData(): Promise<PerkData[]> {
        return await fetch(this.sharedSettings.lookup.perkUrl).then(x => x.json());
    }

    public async loadItemData(): Promise<ItemData[]> {
        const items = await fetch(this.sharedSettings.lookup.itemUrl).then(x => x.json()) as ItemData[];
        for (const item of items) {
            const other = items.find(x => x.id === item.id)!;

            other.from = item.from.map(x => items.find(y => y.id === +x)!).filter(x => x).map(x => x.name);
            other.to = item.to.map(x => items.find(y => y.id === +x)!).filter(x => x).map(x => x.name);
        }

        return items;
    }

    public onLookup(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (message.cleanContent.length === 0) {
            const response = `Usage: !${command} [type] [term]. Supported types are \`item\`, \`perk\`, \`rune\` and \`champion\`.`;
            message.channel.send(response);
            return;
        }

        if (!["item", "perk", "rune", "champion"].includes(args[0])) {
            message.channel.send(`I'm sorry. I'm unable to parse the category \`${args[0]}\` at this moment. If you think it should be added, please contact a guru.`);
            return;
        }

        if (args[0] === "item") {
            message.channel.send(this.findItem(args.slice(1).join(" ")));
            return;
        }

        if (args[0] === "perk" || args[0] === "rune") {
            message.channel.send(this.findPerk(args.slice(1).join(" ")));
            return;
        }

        if (args[0] === "champion") {
            message.channel.send(this.findChampion(args.slice(1).join(" ")));
            return;
        }
    }

    public findItem(search: string): string {
        if (!search) {
            return `There are currently ${this.itemData.length} items in my lookup data!`;
        }

        // match name loosely, but ids strictly
        const result = this.itemData.filter(c => (Math.min
            (
                levenshteinDistance(search, c.name),
                levenshteinDistanceArray(search, c.categories),

            ) < 3) || levenshteinDistance(search, c.id.toString()) < 1);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        if (result.length > 3) {
            let response = "Too many results returned for that search, please try one of the options below:\n";
            result.forEach(r => response += `\`${r.name}\`, `);
            response = response.slice(0, -2);
            return response;
        }

        const returnedValue = {
            id: result[0].id,
            name: result[0].name,
            combineCost: result[0].price,
            cost: result[0].priceTotal,
            from: result[0].from,
            to: result[0].to,
        };

        return "```" + JSON.stringify(returnedValue, null, 4) + "```";
    }

    public findPerk(search: string): string {
        if (!search) {
            return `There are currently ${this.perkData.length} perks in my lookup data!`;
        }

        const result = this.perkData.filter(c => Math.min(
            ...[
                levenshteinDistance(search, c.id.toString()),
                levenshteinDistance(search, c.name),
                levenshteinDistance(search, c.shortDesc),
            ]) < 1);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        if (result.length > 1) {
            let response = "Too many results returned for that search, please try one of the options below:\n";
            result.forEach(r => response += `\`${r}\`, `);
            response = response.slice(0, -2);
            return response;
        }

        const returnedValue = {
            id: result[0].id,
            name: result[0].name,
            endOfGameStatDescs: result[0].endOfGameStatDescs,
        };

        return "```" + JSON.stringify(returnedValue, null, 4) + "```";
    }

    public findChampion(search: string): string {
        if (!search) {
            return `There are currently ${this.champData.length} champions in my lookup data!`;
        }

        const result = this.champData.filter(c => Math.min(
            ...[
                levenshteinDistance(search, c.id.toString()),
                levenshteinDistance(search, c.name),
                levenshteinDistance(search, c.key),
            ]) < 3);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        if (result.length > 1) {
            let response = "Too many results returned for that search, please try one of the options below:\n";
            result.forEach(r => response += `\`${r}\`, `);
            response = response.slice(0, -2);
            return response;
        }

        // maybe return the skin names here?
        const returnedValue = { ...result[0] } as any;
        returnedValue.skins = returnedValue.skins.length;

        return "```" + JSON.stringify(returnedValue, null, 4) + "```";
    }
}
