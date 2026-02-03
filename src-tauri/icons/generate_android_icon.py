#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Android 图标：蓝色背景 + 居中缩小的 logo
"""

from PIL import Image, ImageDraw
from collections import Counter

# 配置
CANVAS_SIZE = 1024
LOGO_SCALE = 0.65  # logo 缩放比例（65%）

# 文件路径
LOGO_PATH = "icon.png"
OUTPUT_PATH = "icon_android.png"

def extract_dominant_blue(logo_img):
    """从 logo 中提取主要的蓝色"""
    # 转换为 RGB 以便分析
    rgb_img = logo_img.convert('RGB')
    pixels = list(rgb_img.getdata())

    # 过滤出蓝色调的像素（蓝色通道 > 红色和绿色）
    blue_pixels = [p for p in pixels if p[2] > p[0] and p[2] > p[1] and p[2] > 100]

    if not blue_pixels:
        # 如果没找到蓝色像素，使用默认蓝色
        return "#0085ff"

    # 找出最常见的蓝色
    color_counter = Counter(blue_pixels)
    most_common_color = color_counter.most_common(1)[0][0]

    # 转换为十六进制
    return '#{:02x}{:02x}{:02x}'.format(*most_common_color)

def generate_android_icon():
    """生成 Android 图标"""
    # 加载原始 logo
    logo = Image.open(LOGO_PATH).convert('RGBA')

    # 提取 logo 的主要蓝色
    bg_color = extract_dominant_blue(logo)
    print(f"Extracted background color: {bg_color}")

    # 创建蓝色背景
    canvas = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), bg_color)

    # 计算缩放后的尺寸
    logo_size = int(CANVAS_SIZE * LOGO_SCALE)
    logo_resized = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

    # 计算居中位置
    position = ((CANVAS_SIZE - logo_size) // 2, (CANVAS_SIZE - logo_size) // 2)

    # 将 logo 粘贴到画布中央
    canvas.paste(logo_resized, position, logo_resized)

    # 保存
    canvas.save(OUTPUT_PATH, 'PNG')
    print(f"Android icon generated: {OUTPUT_PATH}")
    print(f"   - Size: {CANVAS_SIZE}x{CANVAS_SIZE}px")
    print(f"   - Background: {bg_color}")
    print(f"   - Logo scale: {int(LOGO_SCALE * 100)}%")

if __name__ == "__main__":
    generate_android_icon()
