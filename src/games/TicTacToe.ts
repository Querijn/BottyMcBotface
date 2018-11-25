import { fileBackedObject } from "../FileBackedObject";
import Botty from "../Botty";

import Discord = require("discord.js");
import { stat } from "fs";

interface TicTacToeScore {
    lowWins: number;
    highWins: number;
    draws: number;
}

enum TicTacToeType {
    X = "X", O = "O",
}

namespace TicTacToeType {
    export function opposite(current: TicTacToeType): TicTacToeType | undefined {
        if (current === TicTacToeType.X) return TicTacToeType.O;
        if (current === TicTacToeType.O) return TicTacToeType.X;
        return undefined;
    }
}

interface TicTacToeGame {
    board: { [key: number]: TicTacToeType };
    turnPlayer: TicTacToeType;
    Xplayer: string;
    Oplayer: string;
    scoreKey: string;
    channel: Discord.TextChannel;
}

export default class TicTacToe {

    private scores: { [key: string]: TicTacToeScore };
    private games: TicTacToeGame[] = [];

    constructor(client: Discord.Client, scorefile: string) {
        this.scores = fileBackedObject(scorefile);
        client.on("message", this.handleChat.bind(this));
    }

    public async onInvite(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const opponent = message.mentions.users.first();
        if (!opponent) {
            message.reply("You need to specify an opponent to start a TTT game!");
            return;
        }

        const isBottyOpponent = opponent.bot;
        if (isBottyOpponent) {
            message.reply("Playing against Botty does not work at the moment.. :(");
            return;
        }

        const senderName = message.author.username;
        const opponentName = opponent.username;
        const key = message.author.id.localeCompare(opponent.id) ? message.author.id + "_" + opponent.id : opponent.id + "_" + message.author.id;
        const highP = message.author.id.localeCompare(opponent.id) ? senderName : opponentName;
        const lowP = opponent.id.localeCompare(message.author.id) ? opponentName : senderName;

        // setup a separate channel for the game, so we dont spam a real channel..
        const channelName = ("TTT-" + highP + "-vs-" + lowP).toLowerCase();
        if (message.guild.channels.find(c => c.name === channelName)) {
            message.reply("A game with this name already exists, so you need to finish it first...");
            return;
        }

        // only allow the players to send messages
        const permissions = [
            { id: message.author, type: "member", allow: ["SEND_MESSAGES"] },
            { id: opponent, type: "member", allow: ["SEND_MESSAGES"] },
            { id: message.guild.roles.find(r => r.name === "@everyone").id, type: "role", deny: ["SEND_MESSAGES"] },
        ];

        const gameChannel = await message.guild.createChannel(channelName, "text", permissions) as Discord.TextChannel;
        let gameCategory = message.guild.channels.filter(c => c.type === "category").find(c => c.name === "games");
        if (!gameCategory) {
            gameCategory = await message.guild.createChannel("games", "category");
        }
        gameChannel.setParent(gameCategory);

        // setup game state
        const game = {} as TicTacToeGame;
        this.games.push(game);

        const random = Math.floor(Math.random() * 2);
        game.Xplayer = random ? message.author.id : opponent.id;
        game.Oplayer = random ? opponent.id : message.author.id;
        game.channel = gameChannel;
        game.turnPlayer = TicTacToeType.O;
        game.board = {};
        game.scoreKey = key;

        // print the "welcome" message
        const status = this.scores[key] || (this.scores[key] = { highWins: 0, lowWins: 0, draws: 0 });
        const gamesPlayed = status.highWins + status.lowWins + status.draws;
        const startingPlayer = random ? senderName : opponentName;
        gameChannel.send(`Game ${gamesPlayed + 1} of ${message.author} vs ${opponent}\nThe gods have decided that ${startingPlayer} goes first`);

        this.incrementGameState(game, -1);
    }

    private printGameBoard(game: TicTacToeGame) {
        const tl = game.board[1] || "1";
        const tm = game.board[2] || "2";
        const tr = game.board[3] || "3";

        const ml = game.board[4] || "4";
        const mm = game.board[5] || "5";
        const mr = game.board[6] || "6";

        const bl = game.board[7] || "7";
        const bm = game.board[8] || "8";
        const br = game.board[9] || "9";

        game.channel.send(`\`\`\`${tl} | ${tm} | ${tr}\n---------\n${ml} | ${mm} | ${mr}\n---------\n${bl} | ${bm} | ${br}\`\`\``);
    }

    private handleChat(message: Discord.Message) {
        const game = this.games.find(g => g.channel.id === message.channel.id);
        if (!game) return;

        // ignore messages from the other player
        if (game.turnPlayer === TicTacToeType.X) {
            if (message.author.id === game.Oplayer) {
                return;
            }
        }
        if (game.turnPlayer === TicTacToeType.O) {
            if (message.author.id === game.Xplayer) {
                return;
            }
        }

        const regex = /\d/;
        if (regex.test(message.cleanContent)) {
            const move = +message.cleanContent;
            if (this.isValidMove(game.board, move)) {
                this.incrementGameState(game, move);
            }
        }
    }

    private isValidMove(board: { [key: number]: TicTacToeType }, move: number) {
        return board[move] === undefined;
    }

    private incrementGameState(game: TicTacToeGame, move: number) {
        if (move) {
            game.board[move] = game.turnPlayer;
        }

        game.turnPlayer = TicTacToeType.opposite(game.turnPlayer)!;
        this.printGameBoard(game);

        const winner = this.getGameWinner(game);
        if (winner) {
            const high = game.Oplayer.localeCompare(game.Xplayer);
            if (winner === game.Oplayer) {
                if (high) {
                    this.scores[game.scoreKey].highWins = this.scores[game.scoreKey].highWins + 1;
                } else {
                    this.scores[game.scoreKey].lowWins = this.scores[game.scoreKey].lowWins + 1;
                }
            } else if (winner === game.Xplayer) {
                if (high) {
                    this.scores[game.scoreKey].lowWins = this.scores[game.scoreKey].lowWins + 1;
                } else {
                    this.scores[game.scoreKey].highWins = this.scores[game.scoreKey].highWins + 1;
                }
            } else if (winner === "-1") {
                this.scores[game.scoreKey].draws = this.scores[game.scoreKey].draws + 1;
            }

            const oplayer = game.channel.members.find(m => m.id === game.Oplayer);
            const xplayer = game.channel.members.find(m => m.id === game.Xplayer);

            const highP = high ? oplayer.user.username : xplayer.user.username;
            const lowP = high ? xplayer.user.username : oplayer.user.username;
            const highScore = this.scores[game.scoreKey].highWins;
            const lowScore = this.scores[game.scoreKey].lowWins;
            const drawScore = this.scores[game.scoreKey].draws;

            game.channel.send("The game has ended!\nScores are now: " + highP + "(" + highScore + ") - " + drawScore + " - " + lowP + "(" + lowScore + ")");
            game.channel.overwritePermissions(oplayer, { SEND_MESSAGES: false });
            game.channel.overwritePermissions(xplayer, { SEND_MESSAGES: false });
            this.games = this.games.filter(g => g !== game);
            return;
        }

        this.doBottyMove(game);
    }

    /**
     * returns "-1" for a draw
     * returns undefined for unfinished
     * otherwise the playerid of the winner
     */
    private getGameWinner(game: TicTacToeGame) {

        let player = TicTacToeType.X;
        if ((game.board[1] === player && game.board[2] === player && game.board[3] === player) ||
            (game.board[4] === player && game.board[5] === player && game.board[6] === player) ||
            (game.board[7] === player && game.board[8] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[4] === player && game.board[7] === player) ||
            (game.board[2] === player && game.board[5] === player && game.board[8] === player) ||
            (game.board[3] === player && game.board[6] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[5] === player && game.board[9] === player) ||
            (game.board[3] === player && game.board[5] === player && game.board[7] === player)) {
            return game.Xplayer;
        }
        player = TicTacToeType.O;
        if ((game.board[1] === player && game.board[2] === player && game.board[3] === player) ||
            (game.board[4] === player && game.board[5] === player && game.board[6] === player) ||
            (game.board[7] === player && game.board[8] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[4] === player && game.board[7] === player) ||
            (game.board[2] === player && game.board[5] === player && game.board[8] === player) ||
            (game.board[3] === player && game.board[6] === player && game.board[9] === player) ||
            (game.board[1] === player && game.board[5] === player && game.board[9] === player) ||
            (game.board[3] === player && game.board[5] === player && game.board[7] === player)) {
            return game.Oplayer;
        }

        for (let i = 1; i < 10; i++) {
            if (game.board[i] === undefined) {
                return undefined;
            }
        }

        return "-1";
    }

    private doBottyMove(game: TicTacToeGame) {
        const turnId = game.turnPlayer === TicTacToeType.X ? game.Xplayer : game.Oplayer;
        const isBottyTurn = game.channel.members.find(m => m.id === turnId).user.bot;

        if (isBottyTurn) {
            const bestMove = this.minimax({ ...game });
            this.incrementGameState(game, bestMove);
        }
    }

    private minimax(game: TicTacToeGame) {
        return 1;
    }
}
