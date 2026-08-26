/**
 * Logger Utility for Migration Scripts
 */

import chalk from 'chalk';
import { formatDuration } from './database';

export class MigrationLogger {
    private startTime: number;
    private verbose: boolean;

    constructor(verbose: boolean = false) {
        this.startTime = Date.now();
        this.verbose = verbose;
    }

    info(message: string): void {
        console.log(chalk.blue('ℹ'), message);
    }

    success(message: string): void {
        console.log(chalk.green('✓'), message);
    }

    error(message: string, error?: Error): void {
        console.log(chalk.red('✗'), message);
        if (error && this.verbose) {
            console.error(chalk.red(error.stack || error.message));
        }
    }

    warn(message: string): void {
        console.log(chalk.yellow('⚠'), message);
    }

    debug(message: string): void {
        if (this.verbose) {
            console.log(chalk.gray('→'), message);
        }
    }

    section(title: string): void {
        console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
        console.log(chalk.bold.cyan(`  ${title}`));
        console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');
    }

    subsection(title: string): void {
        console.log('\n' + chalk.cyan(`─── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`));
    }

    progress(current: number, total: number, message?: string): void {
        const percentage = ((current / total) * 100).toFixed(1);
        const bar = this.createProgressBar(current, total);
        const msg = message ? ` ${message}` : '';
        process.stdout.write(`\r${bar} ${percentage}%${msg}    `);
        if (current === total) {
            process.stdout.write('\n');
        }
    }

    private createProgressBar(current: number, total: number, width: number = 40): string {
        const percentage = Math.min(100, Math.max(0, (current / total) * 100));
        const filled = Math.floor((percentage / 100) * width);
        const empty = width - filled;

        return `[${chalk.green('█'.repeat(filled))}${' '.repeat(empty)}]`;
    }

    table(data: Array<Record<string, any>>, columns: string[]): void {
        if (data.length === 0) {
            this.warn('No data to display');
            return;
        }

        // Calculate column widths
        const widths: Record<string, number> = {};
        columns.forEach(col => {
            widths[col] = Math.max(
                col.length,
                ...data.map(row => String(row[col] || '').length)
            );
        });

        // Print header
        const header = columns.map(col => col.padEnd(widths[col])).join(' │ ');
        console.log(chalk.bold(header));
        console.log(columns.map(col => '─'.repeat(widths[col])).join('─┼─'));

        // Print rows
        data.forEach(row => {
            const line = columns.map(col => {
                const value = String(row[col] || '');
                return value.padEnd(widths[col]);
            }).join(' │ ');
            console.log(line);
        });
    }

    summary(stats: Record<string, number | string>): void {
        this.subsection('Summary');
        Object.entries(stats).forEach(([key, value]) => {
            const label = key.padEnd(30);
            console.log(`  ${chalk.gray(label)} ${chalk.bold(value)}`);
        });
    }

    elapsed(): string {
        const duration = Date.now() - this.startTime;
        return formatDuration(duration);
    }

    finish(message?: string): void {
        const elapsed = this.elapsed();
        console.log('\n' + chalk.bold.green('═'.repeat(60)));
        console.log(chalk.bold.green(`  ${message || 'Migration completed'} (${elapsed})`));
        console.log(chalk.bold.green('═'.repeat(60)) + '\n');
    }
}

export const logger = new MigrationLogger(process.env.VERBOSE === 'true');
