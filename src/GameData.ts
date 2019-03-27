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
        const supportedTypes = ["item", "perk", "rune", "champion"];

        if (args.length === 0) {
            const response = `Usage: !${command} [type] [term]. Supported types are ` + supportedTypes.map(x => "`" + x + "`").join(", ");
            message.channel.send(response);
            return;
        }

        if (!supportedTypes.includes(args[0])) {
            message.channel.send(`I'm sorry. I'm unable to parse the category \`${args[0]}\` at this moment. If you think it should be added, please contact a guru.`);
            return;
        }

        let result: string | any[] = [];
        switch (args[0]) {
            case "item": {
                result = this.findItem(args.slice(1).join(" "));
                break;
            }
            case "perk": // fall through
            case "rune": {
                result = this.findPerk(args.slice(1).join(" "));
                break;
            }
            case "champion": {
                result = this.findChampion(args.slice(1).join(" "));
                break;
            }
        }

        if (typeof result === "string") {
            message.channel.send(result);
            return;
        }

        result.forEach(x => message.channel.send("```" + JSON.stringify(x, null, 4) + "```"));
    }

    public findItem(search: string): string | any[] {
        if (!search) {
            return `There are currently ${this.itemData.length} items in my lookup data!`;
        }

        // match name loosely, but ids strictly
        const result = this.itemData.map(c => ({
            value: c,
            textscore: Math.min(
                levenshteinDistance(search, c.name),
                levenshteinDistanceArray(search, c.categories),
            ),
            idscore: Math.min(
                levenshteinDistance(search, c.id.toString()),
            ),
        })).filter(x => x.textscore < this.sharedSettings.lookup.textConfidence || x.idscore < this.sharedSettings.lookup.numberConfidence);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        result.sort((a, b) => Math.min(a.textscore, a.idscore) > Math.min(b.textscore, b.idscore) ? 1 : -1);

        if (result.length > this.sharedSettings.lookup.returnedEntryCount) {
            let response = "Too many results returned for that search, did you mean one of the options below?\n";
            response += result.map(x => `\`${x.value.name}\``).join("\n");
            return response;
        }

        return result.slice(0, this.sharedSettings.lookup.returnedEntryCount).map(x => ({
            id: x.value.id,
            name: x.value.name,
            combineCost: x.value.price,
            cost: x.value.priceTotal,
            from: x.value.from,
            to: x.value.to,
        }));
    }

    public findPerk(search: string): string | any[] {
        if (!search) {
            return `There are currently ${this.perkData.length} perks in my lookup data!`;
        }

        // match name loosely, but ids strictly
        const result = this.perkData.map(c => ({
            value: c,
            textscore: Math.min(
                levenshteinDistance(search, c.name),
            ),
            idscore: Math.min(
                levenshteinDistance(search, c.id.toString()),
            ),
        })).filter(x => x.textscore < this.sharedSettings.lookup.textConfidence || x.idscore < this.sharedSettings.lookup.numberConfidence);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        result.sort((a, b) => Math.min(a.textscore, a.idscore) > Math.min(b.textscore, b.idscore) ? 1 : -1);

        if (result.length > this.sharedSettings.lookup.returnedEntryCount) {
            let response = "Too many results returned for that search, did you mean one of the options below?\n";
            response += result.map(x => `\`${x.value.name}\``).join("\n");
            return response;
        }

        return result.slice(0, this.sharedSettings.lookup.returnedEntryCount).map(x => ({
            id: x.value.id,
            name: x.value.name,
            endOfGameStatDescs: x.value.endOfGameStatDescs,
        }));
    }

    public findChampion(search: string): string | any[] {
        if (!search) {
            return `There are currently ${this.champData.length} champions in my lookup data!`;
        }

        // match name loosely, but ids strictly
        const result = this.champData.map(c => ({
            value: c,
            textscore: Math.min(
                levenshteinDistance(search, c.name),
                levenshteinDistance(search, c.key),
            ),
            idscore: Math.min(
                levenshteinDistance(search, c.id.toString()),
            ),
        })).filter(x => x.textscore < this.sharedSettings.lookup.textConfidence || x.idscore < this.sharedSettings.lookup.numberConfidence);

        if (result.length === 0) {
            return "Unable to find any data for that search term.";
        }

        result.sort((a, b) => Math.min(a.textscore, a.idscore) > Math.min(b.textscore, b.idscore) ? 1 : -1);

        if (result.length > this.sharedSettings.lookup.returnedEntryCount) {
            let response = "Too many results returned for that search, did you mean one of the options below?\n";
            response += result.map(x => `\`${x.value.name}\``).join("\n");
            return response;
        }

        return result.slice(0, this.sharedSettings.lookup.returnedEntryCount).map(x => ({
            ...x.value,
            skins: x.value.skins.length,
        }));
    }
}
