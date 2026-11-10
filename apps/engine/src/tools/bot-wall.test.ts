import { describe, expect, it } from 'vitest'
import { detectBotWall } from './bot-wall.js'

describe('detectBotWall', () => {
    it('names a Cloudflare interstitial as a challenge worth waiting for', () => {
        expect(detectBotWall({ html: '<html><head><title>Just a moment...</title>', text: '' })).toEqual({ provider: 'Cloudflare', clearsByItself: true })
    })

    it('names the Cloudflare verification Indeed serves under its own header', () => {
        expect(detectBotWall({ html: '', text: 'Find jobs Company Reviews Sign in Additional Verification Required' })?.provider).toBe('Cloudflare')
    })

    it('names a DataDome captcha from its iframe', () => {
        expect(detectBotWall({ html: '<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x">', text: '' })?.provider).toBe('DataDome')
    })

    it('reads the Reddit and Google blocks as final', () => {
        expect(detectBotWall({ html: '', text: "You've been blocked by network security." })).toEqual({ provider: 'Reddit', clearsByItself: false })
        expect(detectBotWall({ html: '', text: 'Prove your humanity. Complete the challenge below.' })?.provider).toBe('Reddit')
        expect(detectBotWall({ html: '<form action="/sorry/index">', text: 'Our systems have detected unusual traffic' })).toEqual({ provider: 'Google', clearsByItself: false })
    })

    it('ignores a full page that merely ships a bot vendor script', () => {
        expect(detectBotWall({ html: '<script src="https://js.captcha-delivery.com/tags.js"></script>', text: 'x'.repeat(5_000) })).toBeNull()
    })

    it('ignores an ordinary page', () => {
        expect(detectBotWall({ html: '<title>Pricing</title>', text: 'Plans and pricing' })).toBeNull()
    })
})
