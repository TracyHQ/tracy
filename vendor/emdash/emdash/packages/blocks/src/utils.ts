import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof clsx>) {
	return twMerge(clsx(inputs));
}

/**
 * Detects dark mode from `<html data-theme="dark">` or the system
 * `prefers-color-scheme` media query and stays in sync reactively.
 */
export function useIsDarkMode(): boolean {
	const [dark, setDark] = useState(() => {
		if (typeof document === "undefined") return false;
		const attr = document.documentElement.getAttribute("data-theme");
		if (attr === "dark") return true;
		if (attr === "light") return false;
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	});

	useEffect(() => {
		// Watch for data-theme attribute changes on <html>
		const observer = new MutationObserver(() => {
			const attr = document.documentElement.getAttribute("data-theme");
			if (attr === "dark") return setDark(true);
			if (attr === "light") return setDark(false);
			setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});

		// Also watch the system media query
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => {
			if (!document.documentElement.hasAttribute("data-theme")) {
				setDark(e.matches);
			}
		};
		mq.addEventListener("change", handler);

		return () => {
			observer.disconnect();
			mq.removeEventListener("change", handler);
		};
	}, []);

	return dark;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(iso: string): string {
	const date = new Date(iso);
	const now = Date.now();
	const diff = Math.floor((now - date.getTime()) / 1000);

	if (diff < 0) {
		return "just now";
	}
	if (diff < MINUTE) {
		return "just now";
	}
	if (diff < HOUR) {
		const mins = Math.floor(diff / MINUTE);
		return mins === 1 ? "1 minute ago" : `${mins} minutes ago`;
	}
	if (diff < DAY) {
		const hours = Math.floor(diff / HOUR);
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	}
	if (diff < WEEK) {
		const days = Math.floor(diff / DAY);
		return days === 1 ? "1 day ago" : `${days} days ago`;
	}
	if (diff < MONTH) {
		const weeks = Math.floor(diff / WEEK);
		return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
	}
	if (diff < YEAR) {
		const months = Math.floor(diff / MONTH);
		return months === 1 ? "1 month ago" : `${months} months ago`;
	}
	const years = Math.floor(diff / YEAR);
	return years === 1 ? "1 year ago" : `${years} years ago`;
}
