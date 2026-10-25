---
id: pkg:npm/pdfkit
name: pdfkit
url:
language: JavaScript
license: MIT
topics: []
packages: []
explored: 2026-09-12
kind: library
tags: [pdf]
tried: true
rating: 2
status: reviewed
alternatives: ["[[puppeteer]]", "[[pdf-lib]]"]
---

## Verdict
avoid: async streams painful; use puppeteer

## Use when
- a small, synchronous PDF with a few lines of text

## Avoid when
- you need streamed output for large PDFs

## What it does
A PDF generation library for Node and the browser, with a drawing API for text, vectors and images.

## How to use

## Notable skills

## My notes
Tried it for the invoice export. Awaiting the end of the stream took a day of debugging.

## Related
