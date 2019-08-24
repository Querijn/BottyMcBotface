import fetch from "node-fetch";
import Discord = require("discord.js");
import { levenshteinDistance, levenshteinDistanceArray } from "./LevenshteinDistance";
import { SharedSettings } from "./SharedSettings";
import striptags = require("striptags");
import joinArguments from "./JoinArguments";

interface ChampionDataContainer {
    id: number;
    name: string;
    key: string;
    skins: SkinDataContainer[];
}

interface SkinDataContainer {
    id: number;
    name: string;
    splashPath: string;
    uncenteredSplashPath: string;
    tilePath: string;
    loadscreenPath: string;
    chromas: ChromaDataContainer[];
}

interface ChromaDataContainer {
    id: number;
    name: string;
    chromaPath: string;
    colors: string[];
}

interface PerkDataContainer {
    id: number;
    name: string;
    shortDesc: string;
    iconPath: string;
    endOfGameStatDescs: string[];
}

interface ItemDataContainer {
    id: number;
    name: string;
    categories: string[];
    price: number;
    priceTotal: number;
    iconPath: string;
    from: string[];
    to: string[];
}

interface SearchObjectContainer {
    item: {
        id: number;
        name: string;
        key?: string;
    };
    score: number;
}

interface ChampionData {
    id: number;
    name: string;
    key: string;
    skins: string[];
    type: "ChampionData";
}

interface PerkData {
    id: number;
    name: string;
    shortDesc: string;
    endOfGameStatDescs: string[];
    type: "PerkData";
    iconPath: string;
}

interface ItemData {
    id: number;
    name: string;
    combineCost: number;
    cost: number;
    from: string[];
    to: string[];
    type: "ItemData";
    iconPath: string;
}

type EmbeddableDatum = ChampionData | PerkData | ItemData;

export default class GameData {
    private champData: ChampionDataContainer[];
    private perkData: PerkDataContainer[];
    private itemData: ItemDataContainer[];

    private bot: Discord.Client;
    private sharedSettings: SharedSettings;

    public constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.sharedSettings = settings;

        bot.on("ready", () => {
            this.reloadData();
            setInterval(this.reloadData.bind(this), this.sharedSettings.lookup.refreshTimeout);
        });
    }

    public async reloadData() {
        this.champData = await this.loadChampionData();
        this.perkData = await this.loadPerkData();
        this.itemData = await this.loadItemData();
        console.log("Game data loaded!");
    }

    public async loadChampionData(): Promise<ChampionDataContainer[]> {
        const champions = await fetch(this.sharedSettings.lookup.championUrl).then(x => x.json());

        const returnData: ChampionDataContainer[] = champions
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

    public async loadSkinData(): Promise<SkinDataContainer[]> {
        return Object.values(await fetch(this.sharedSettings.lookup.skinUrl).then(x => x.json())) as SkinDataContainer[];
    }

    public async loadPerkData(): Promise<PerkDataContainer[]> {
        return await fetch(this.sharedSettings.lookup.perkUrl).then(x => x.json());
    }

    public async loadItemData(): Promise<ItemDataContainer[]> {
        const items = await fetch(this.sharedSettings.lookup.itemUrl).then(x => x.json()) as ItemDataContainer[];
        for (const item of items) {
            const other = items.find(x => x.id === item.id)!;

            other.from = item.from.map(x => items.find(y => y.id === +x)!).filter(x => x).map(x => x.name);
            other.to = item.to.map(x => items.find(y => y.id === +x)!).filter(x => x).map(x => x.name);
        }

        return items;
    }

    public onLookup(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {
        const supportedTypes = ["item", "perk", "rune", "champion", "champ"];

        if (args.length === 0) {
            let response = "";
            if (supportedTypes.includes(command)) {
                response = `Usage: !${command} [term]. Supported types are ` + supportedTypes.map(x => "`" + x + "`").join(", ");
            } else {
                response = `Usage: !${command} [type] [term]. Supported types are ` + supportedTypes.map(x => "`" + x + "`").join(", ");
            }
            message.channel.send(response);
            return;
        }

        if (supportedTypes.includes(command)) {
            args.unshift(command);
        }

        if (!supportedTypes.includes(args[0])) {
            message.channel.send(`I'm sorry. I'm unable to parse the category \`${args[0]}\` at this moment. If you think it should be added, please contact a guru.`);
            return;
        }

        const searchTerm = joinArguments(args, separators, 1).toLowerCase();
        let result: string | EmbeddableDatum = "";
        switch (args[0]) {
            case "item": {
                result = this.findItem(searchTerm);
                break;
            }
            case "perk": // fall through
            case "rune": {
                result = this.findPerk(searchTerm);
                break;
            }
            case "champion": // fall through
            case "champ": {
                result = this.findChampion(searchTerm);
                break;
            }
        }

        if (typeof result === "string") {
            message.channel.send(result);
        } else {
            message.channel.send(this.buildEmbed(result));
        }
    }

    public buildEmbed(rawData: EmbeddableDatum) {
        const embed = new Discord.RichEmbed();
        switch (rawData.type) {
            case "ChampionData": {
                const imageString = `https://cdn.communitydragon.org/latest/champion/${rawData.id}/square`;
                embed.setThumbnail(imageString);
                embed.setURL(this.sharedSettings.lookup.championUrl);
                break;
            }
            case "ItemData": {
                const imageString = `https://raw.communitydragon.org/latest/plugins${(rawData as ItemData).iconPath}`
                    .replace("lol-game-data", "rcp-be-lol-game-data/global/default")
                    .replace("/assets", "")
                    .toLowerCase();
                embed.setThumbnail(imageString);
                embed.setURL(this.sharedSettings.lookup.itemUrl);
                break;
            }
            case "PerkData": {
                const imageString = `https://raw.communitydragon.org/latest/plugins${(rawData as PerkData).iconPath}`
                    .replace("lol-game-data", "rcp-be-lol-game-data/global/default")
                    .replace("/assets", "")
                    .toLowerCase();
                embed.setThumbnail(imageString);
                embed.setURL(this.sharedSettings.lookup.perkUrl);
                break;
            }
        }
        delete rawData.type;
        if ("iconPath" in rawData) {
            delete rawData.iconPath;
        }

        embed.setTitle(rawData.name);
        for (const [key, value] of Object.entries(rawData)) {
            const keyString = key.toString().charAt(0).toUpperCase() + key.toString().slice(1);
            const valueString = striptags(value.toString());
            if (valueString !== "") { 
                if (Array.isArray(value)) {
                    if (value.length > 4) {
                        embed.addField(keyString, `${value.slice(0, 4).join(", ")} + ${value.length - 4} more…`);
                    } else {
                        embed.addField(keyString, `${value.join(", ")}`);
                    }
                } else {
                    embed.addField(keyString, valueString, true);
                }
            }
        }

        return embed;
    }

    public sortSearch(search: string, a: SearchObjectContainer, b: SearchObjectContainer) {
        if (a.score === 0) return -1;
        if (b.score === 0) return 1;

        const nameA = a.item.name.toLowerCase();
        const nameB = b.item.name.toLowerCase();

        if (nameA === search) return -1;
        if (nameB === search) return 1;

        if (nameA.startsWith(search) && !nameB.startsWith(search)) return -1;
        if (nameB.startsWith(search) && !nameA.startsWith(search)) return 1;

        if (nameA.includes(search) && !nameB.includes(search)) return -1;
        if (nameB.includes(search) && !nameA.includes(search)) return 1;

        if (a.item.key && b.item.key) {
            const keyA = a.item.key;
            const keyB = b.item.key;

            if (keyA === search) return -1;
            if (keyB === search) return 1;

            if (keyA.startsWith(search) && !keyB.startsWith(search)) return -1;
            if (keyB.startsWith(search) && !keyA.startsWith(search)) return 1;

            if (keyA.includes(search) && !keyB.includes(search)) return -1;
            if (keyB.includes(search) && !keyA.includes(search)) return 1;
        }

        const idA = a.item.id.toString();
        const idB = a.item.id.toString();

        if (idA === search) return -1;
        if (idB === search) return 1;

        if (idA.startsWith(search) && !idB.startsWith(search)) return -1;
        if (idB.startsWith(search) && !idA.startsWith(search)) return 1;

        if (idA.includes(search) && !idB.includes(search)) return -1;
        if (idB.includes(search) && !idA.includes(search)) return 1;

        if (a.score < b.score) return -1;
        if (b.score < a.score) return 1;

        return 0;
    }

    public findItem(search: string): string | ItemData {
        if (!search) {
            return `There are currently ${this.itemData.length} items in my lookup data!`;
        }

        const searchResult: SearchObjectContainer[] = this.itemData.map(i => ({
            item: i,
            score: levenshteinDistance(search, search.match(/^\d+$/) ? i.id.toString() : i.name.toLowerCase()),
        }))
            .sort((a, b) => this.sortSearch(search, a, b))
            .slice(0, this.sharedSettings.lookup.maxGuessCount);

        // no exact match, so give alternatives
        if (searchResult[0].score > this.sharedSettings.lookup.confidence) {
            let response = "Too many results returned for that search, did you mean one of the options below?\n```";
            response += searchResult.map(x => `${x.item.name} (Alternate terms: ${x.item.id})`).join("\n");
            response += "```";
            return response;
        }

        return searchResult.map(x => x.item as ItemDataContainer)
            .map(x => ({
                id: x.id,
                name: x.name,
                combineCost: x.price,
                cost: x.priceTotal,
                from: x.from,
                to: x.to,
                iconPath: x.iconPath,
                type: "ItemData",
            }))[0] as ItemData;
    }

    public findPerk(search: string): string | PerkData {
        if (!search) {
            return `There are currently ${this.perkData.length} perks in my lookup data!`;
        }

        const searchResult: SearchObjectContainer[] = this.perkData.map(i => ({
            item: i,
            score: levenshteinDistance(search, search.match(/^\d+$/) ? i.id.toString() : i.name.toLowerCase()),
        }))
            .sort((a, b) => this.sortSearch(search, a, b))
            .slice(0, this.sharedSettings.lookup.maxGuessCount);

        // no exact match, so give alternatives
        if (searchResult[0].score > this.sharedSettings.lookup.confidence) {
            let response = "Too many results returned for that search, did you mean one of the options below?\n```";
            response += searchResult.map(x => `${x.item.name} (Alternate terms: ${x.item.id})`).join("\n");
            response += "```";
            return response;
        }

        return searchResult.map(x => x.item as PerkDataContainer)
            .map(x => ({
                id: x.id,
                name: x.name,
                shortDesc: x.shortDesc,
                endOfGameStatDescs: x.endOfGameStatDescs,
                iconPath: x.iconPath,
                type: "PerkData",
            }))[0] as PerkData;
    }

    public findChampion(search: string): string | ChampionData {
        if (!search) {
            return `There are currently ${this.champData.length} champions in my lookup data!`;
        }

        const searchResult: SearchObjectContainer[] = this.champData.map(i => ({
            item: i,
            score: search.match(/^\d+$/) ? levenshteinDistance(search, i.id.toString()) : Math.min(
                levenshteinDistance(search, i.name.toLowerCase()),
                levenshteinDistance(search, i.key.toLowerCase()),
            ),
        }))
            .sort((a, b) => this.sortSearch(search, a, b))
            .slice(0, this.sharedSettings.lookup.maxGuessCount);

        // no exact match, so give alternatives
        if (searchResult[0].score > this.sharedSettings.lookup.confidence) {
            let response = "Too many results returned for that search, did you mean one of the options below?\n```";
            response += searchResult.map(x => `${x.item.name} (Alternate terms: ${x.item.id} / ${x.item.key})`).join("\n");
            response += "```";
            return response;
        }

        return searchResult.map(x => x.item as ChampionDataContainer)
            .map(x => ({
                ...x,
                skins: x.skins.map(s => s.name).filter(s => s !== x.name),
                type: "ChampionData",
            }))[0] as ChampionData;
    }
}
