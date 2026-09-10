const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs').promises;
const path = require('path');

let doc = null;

async function initSheets() {
    try {
        const credentialsPath = path.join(__dirname, 'credentials.json');
        
        // Check if credentials exist
        try {
            await fs.access(credentialsPath);
        } catch (e) {
            console.error("❌ Google Sheets Error: credentials.json not found. Sheets will not sync.");
            return false;
        }

        if (!process.env.SPREADSHEET_ID) {
            console.error("❌ Google Sheets Error: SPREADSHEET_ID not found in .env. Sheets will not sync.");
            return false;
        }

        const creds = require(credentialsPath);

        // Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key.replace(/\\n/g, '\n').replace(/\r/g, ''),
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
            ],
        });

        doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo();
        console.log(`✅ Google Sheets Connected: ${doc.title}`);

        // Ensure sheets exist
        await ensureSheetExists('Settings', ['Key', 'Value']);
        await ensureSheetExists('Creator Streaks', ['User ID', 'Post Count', 'Last Post Timestamp', 'Tier Name']);
        await ensureSheetExists('Weekly Streaks', ['User ID', 'Post Count']);
        await ensureSheetExists('Weekly Posts', ['Message ID', 'Author ID', 'Media URL', 'Votes', 'Voters (Comma Separated)']);

        return true;
    } catch (error) {
        console.error("❌ Failed to initialize Google Sheets:", error);
        doc = null;
        return false;
    }
}

async function ensureSheetExists(title, headerValues) {
    if (!doc) return;
    let sheet = doc.sheetsByTitle[title];
    if (!sheet) {
        console.log(`Creating missing sheet: ${title}`);
        sheet = await doc.addSheet({ title, headerValues });
    } else {
        // Optionally ensure headers are correct if it exists
        await sheet.loadHeaderRow().catch(async () => {
             await sheet.setHeaderRow(headerValues);
        });
    }
    return sheet;
}

async function syncStateToSheets(state) {
    if (!doc) {
        // Not initialized, try initializing again or just skip
        const initialized = await initSheets();
        if (!initialized) return;
    }

    try {
        // 1. Sync Settings
        const settingsSheet = doc.sheetsByTitle['Settings'];
        if (settingsSheet) {
            await settingsSheet.clearRows();
            await settingsSheet.addRows([
                { Key: 'bookingsEnabled', Value: state.bookingsEnabled.toString() },
                { Key: 'loggingEnabled', Value: state.loggingEnabled.toString() },
                { Key: 'botLogsChannelId', Value: state.botLogsChannelId || 'None' }
            ]);
        }

        // 2. Sync Creator Streaks
        const streaksSheet = doc.sheetsByTitle['Creator Streaks'];
        if (streaksSheet) {
            await streaksSheet.clearRows();
            const streakRows = Object.entries(state.creatorStreaks || {}).map(([userId, data]) => ({
                'User ID': userId,
                'Post Count': data.postCount,
                'Last Post Timestamp': data.lastPostTimestamp,
                'Tier Name': data.currentTierName || 'None'
            }));
            if (streakRows.length > 0) {
                await streaksSheet.addRows(streakRows);
            }
        }

        // 3. Sync Weekly Streaks
        const weeklyStreaksSheet = doc.sheetsByTitle['Weekly Streaks'];
        if (weeklyStreaksSheet) {
            await weeklyStreaksSheet.clearRows();
            const weeklyRows = Object.entries(state.weeklyCreatorStreaks || {}).map(([userId, data]) => ({
                'User ID': userId,
                'Post Count': data.postCount
            }));
            if (weeklyRows.length > 0) {
                await weeklyStreaksSheet.addRows(weeklyRows);
            }
        }

        // 4. Sync Weekly Posts
        const postsSheet = doc.sheetsByTitle['Weekly Posts'];
        if (postsSheet) {
            await postsSheet.clearRows();
            const postRows = (state.weeklyPosts || []).map(post => ({
                'Message ID': post.messageId,
                'Author ID': post.authorId,
                'Media URL': post.mediaUrl,
                'Votes': post.votes,
                'Voters (Comma Separated)': (post.voters || []).join(', ')
            }));
            if (postRows.length > 0) {
                await postsSheet.addRows(postRows);
            }
        }

        console.log("✅ State successfully synced to Google Sheets.");
    } catch (error) {
        console.error("❌ Error syncing state to Google Sheets:", error);
    }
}

async function pullStateFromSheets() {
    if (!doc) {
        const initialized = await initSheets();
        if (!initialized) return null;
    }

    try {
        let recoveredState = {
            bookingsEnabled: true,
            creatorStreaks: {},
            weeklyCreatorStreaks: {},
            weeklyPosts: [],
            botLogsChannelId: null,
            loggingEnabled: true
        };

        // 1. Recover Settings
        const settingsSheet = doc.sheetsByTitle['Settings'];
        if (settingsSheet) {
            const rows = await settingsSheet.getRows();
            for (const row of rows) {
                const key = row.get('Key');
                const value = row.get('Value');
                if (key === 'bookingsEnabled') recoveredState.bookingsEnabled = (value === 'true');
                if (key === 'loggingEnabled') recoveredState.loggingEnabled = (value === 'true');
                if (key === 'botLogsChannelId') recoveredState.botLogsChannelId = (value === 'None' || !value) ? null : value;
            }
        }

        // 2. Recover Creator Streaks
        const streaksSheet = doc.sheetsByTitle['Creator Streaks'];
        if (streaksSheet) {
            const rows = await streaksSheet.getRows();
            for (const row of rows) {
                const userId = row.get('User ID');
                if (userId) {
                    recoveredState.creatorStreaks[userId] = {
                        postCount: parseInt(row.get('Post Count')) || 0,
                        lastPostTimestamp: parseInt(row.get('Last Post Timestamp')) || null,
                        currentTierName: row.get('Tier Name') === 'None' ? null : row.get('Tier Name')
                    };
                }
            }
        }

        // 3. Recover Weekly Streaks
        const weeklyStreaksSheet = doc.sheetsByTitle['Weekly Streaks'];
        if (weeklyStreaksSheet) {
            const rows = await weeklyStreaksSheet.getRows();
            for (const row of rows) {
                const userId = row.get('User ID');
                if (userId) {
                    recoveredState.weeklyCreatorStreaks[userId] = {
                        postCount: parseInt(row.get('Post Count')) || 0
                    };
                }
            }
        }

        // 4. Recover Weekly Posts
        const postsSheet = doc.sheetsByTitle['Weekly Posts'];
        if (postsSheet) {
            const rows = await postsSheet.getRows();
            for (const row of rows) {
                const messageId = row.get('Message ID');
                if (messageId) {
                    const votersStr = row.get('Voters (Comma Separated)');
                    const voters = votersStr ? votersStr.split(',').map(v => v.trim()).filter(v => v) : [];
                    recoveredState.weeklyPosts.push({
                        messageId: messageId,
                        authorId: row.get('Author ID'),
                        mediaUrl: row.get('Media URL'),
                        votes: parseInt(row.get('Votes')) || 0,
                        voters: voters
                    });
                }
            }
        }

        console.log("✅ Successfully pulled state from Google Sheets.");
        return recoveredState;
    } catch (error) {
        console.error("❌ Error pulling state from Google Sheets:", error);
        return null;
    }
}

module.exports = {
    initSheets,
    syncStateToSheets,
    pullStateFromSheets
};
