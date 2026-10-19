// ホーム画面のアイコンを描き出す。使い方：swift make_icon.swift
import AppKit

func render(_ px: Int) -> Data {
    let s = CGFloat(px)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    // スマホ側が角を丸めるので、四角く塗りつぶす
    NSGradient(starting: NSColor(red: 8 / 255, green: 126 / 255, blue: 165 / 255, alpha: 1),
               ending: NSColor(red: 253 / 255, green: 145 / 255, blue: 145 / 255, alpha: 1))!
        .draw(in: NSRect(x: 0, y: 0, width: s, height: s), angle: -60)
    let cfg = NSImage.SymbolConfiguration(pointSize: s * 0.36, weight: .bold).applying(.init(paletteColors: [.white]))
    if let sym = NSImage(systemSymbolName: "dumbbell.fill", accessibilityDescription: nil)?.withSymbolConfiguration(cfg) {
        let sz = sym.size
        sym.draw(in: NSRect(x: (s - sz.width) / 2, y: (s - sz.height) / 2, width: sz.width, height: sz.height))
    }
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for p in [180, 192, 512] {
    try! render(p).write(to: URL(fileURLWithPath: "icon-\(p).png"))
}
