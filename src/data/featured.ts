/**
 * Sessions shipped with the app, so the deployed demo has real recorded runs to
 * show without anyone having to practise first.
 *
 * To add some: record them locally, press Export on the History page, and save
 * the file over src/data/showcase.json. Same format, nothing to convert.
 */

import file from "./showcase.json";
import { parseHistoryFile, type SavedSession } from "@/lib/history";

const parsed = parseHistoryFile(JSON.stringify(file));

export const FEATURED_SESSIONS: SavedSession[] = parsed.ok ? parsed.sessions : [];
