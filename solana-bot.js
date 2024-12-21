import { Table } from "console-table-printer";

const TOKEN_PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";

async function fetchAllTokenProfiles() {
  try {
    const response = await fetch(TOKEN_PROFILES_URL);
    if (!response.ok) {
      throw new Error(`Error fetching token profiles: ${response.statusText}`);
    }
    const profiles = await response.json(); // returns an array
    return profiles;
  } catch (error) {
    console.error("Error fetching token profiles:", error.message);
    return [];
  }
}

function filterSolanaProfiles(profiles) {
  return profiles.filter(p => p.chainId === "solana");
}

async function fetchDexStatsByAddress(tokenAddress) {
  try {
    const url = `${SEARCH_URL}?q=${tokenAddress}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error searching for token address: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.pairs) return [];
    // Return only pairs that match chainId "solana" for good measure
    return data.pairs.filter(pair => pair.chainId === "solana");
  } catch (error) {
    console.error("Error fetching Dex stats:", error.message);
    return [];
  }
}

function analyzePairs(pairs) {
  return pairs.filter(pair => {
    const volume24h = Number(pair.volume?.h24 || 0);
    const priceChange24h = Number(pair.priceChange?.h24 || 0);
    const liquidityUSD = Number(pair.liquidity?.usd || 0);

    return (
      volume24h > 50000 &&   // Minimum $50k 24h trading volume
      priceChange24h > 5 &&  // Minimum 5% 24h price increase
      liquidityUSD > 10000   // Minimum $10k liquidity
    );
  });
}

// Combine everything: fetch profiles, filter for Solana, for each do a search
async function fetchSolanaTokensWithStats() {
  // Grab all token profiles
  const profiles = await fetchAllTokenProfiles();
  // Filter for Solana tokens
  const solanaProfiles = filterSolanaProfiles(profiles);

  // For each Solana token, fetch the Dex stats
  // This returns an array of results. We may combine them.
  const results = [];
  for (const profile of solanaProfiles) {
    const { tokenAddress, url } = profile;
    // The "url" might be helpful to direct users to DexScreener’s page

    const pairs = await fetchDexStatsByAddress(tokenAddress);
    // Analyze/filter these pairs
    const promisingPairs = analyzePairs(pairs);
    // If any pairs pass the threshold, store them for display
    if (promisingPairs.length > 0) {
      // We also keep track of the tokenProfile info for context
      results.push({
        profile,
        pairs: promisingPairs
      });
    }
  }

  return results;
}

function displayResults(results) {
  if (results.length === 0) {
    console.log("No promising Solana tokens found with the current thresholds.");
    return;
  }

  const table = new Table({
    title: "Promising Solana Tokens (from token-profiles + search)",
    columns: [
      { name: "Symbol", alignment: "left", color: "blue" },
      { name: "Price (USD)", alignment: "right", color: "green" },
      { name: "24h Volume (USD)", alignment: "right", color: "yellow" },
      { name: "24h Price Change (%)", alignment: "right", color: "magenta" },
      { name: "Liquidity (USD)", alignment: "right", color: "cyan" },
      { name: "DexScreener URL", alignment: "left" }
    ]
  });

  // Each result is { profile, pairs[] }
  for (const item of results) {
    const { profile, pairs } = item;
    // Some tokens might have multiple pairs on DexScreener that meet the threshold
    for (const pair of pairs) {
      const priceUsd = Number(pair.priceUsd || 0).toFixed(4);
      const volume24h = Number(pair.volume?.h24 || 0).toLocaleString();
      const priceChange24h = Number(pair.priceChange?.h24 || 0).toFixed(2);
      const liquidityUSD = Number(pair.liquidity?.usd || 0).toLocaleString();

      // "profile.url" might point to DexScreener’s web UI for that token
      table.addRow({
        "Symbol": pair.baseToken?.symbol || "N/A",
        "Price (USD)": `$${priceUsd}`,
        "24h Volume (USD)": `$${volume24h}`,
        "24h Price Change (%)": `${priceChange24h}%`,
        "Liquidity (USD)": `$${liquidityUSD}`,
        "DexScreener URL": profile.url || ""
      });
    }
  }

  table.printTable();
}

async function main() {
  console.log("Fetching Solana tokens from /token-profiles/latest/v1 ...");
  const results = await fetchSolanaTokensWithStats();

  console.log("Displaying results...");
  displayResults(results);
}

// run the bot
main();

