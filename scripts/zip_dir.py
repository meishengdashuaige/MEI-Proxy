"""
zip_dir.py - 标准 zip 打包工具（供 package.js 调用）

用 Python 标准库 zipfile 打包目录，生成对 Firefox/Chrome 完全兼容的标准 zip：
- 路径分隔符强制为正斜杠 '/'（zip 规范要求，PowerShell Compress-Archive 可能有兼容性隐患）
- ZIP_DEFLATED 压缩（Firefox 支持）
- 不写入任何可疑的 extra 字段

用法: python zip_dir.py <源目录> <目标 zip 路径>
"""
import os
import sys
import zipfile


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    src_dir, dest_zip = sys.argv[1], sys.argv[2]
    src_dir = os.path.abspath(src_dir)

    if not os.path.isdir(src_dir):
        print(f"[zip_dir] 源目录不存在: {src_dir}")
        return 1

    count = 0
    with zipfile.ZipFile(dest_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(src_dir):
            for name in files:
                full_path = os.path.join(root, name)
                # 强制正斜杠，兼容 zip 规范与所有浏览器解压器
                rel_path = os.path.relpath(full_path, src_dir).replace(os.sep, '/')
                zf.write(full_path, rel_path)
                count += 1

    print(f"[zip_dir] 已打包 {count} 个文件 -> {os.path.abspath(dest_zip)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
