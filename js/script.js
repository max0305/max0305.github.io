document.addEventListener('DOMContentLoaded', () => {
    const gifContainer = document.getElementById('gif-source-container');
    const asciiOutput = document.getElementById('ascii-output');
    const filenameDisplay = document.getElementById('filename');
    const gameLayer = document.getElementById('game-layer');
    const scoreDisplay = document.getElementById('score-display');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const finalScoreDisplay = document.getElementById('final-score');
    const restartBtn = document.getElementById('restart-btn');
    
    // Buttons
    const nextBtn = document.getElementById('next-btn');
    const modeBtn = document.getElementById('mode-btn');
    const colorBtn = document.getElementById('color-btn');
    const glitchBtn = document.getElementById('glitch-btn');
    const gameBtn = document.getElementById('game-btn');
    
    // GIF 列表
    const gifFiles = [
        'speed.gif',
        'cat.gif',
        'soyo.gif',
        'anon.gif',
        'mortis.gif'
    ];
    
    // 狀態變數
    let currentGifIndex = 0;
    let animationId = null;
    let rubb = null;
    
    // 視覺設定
    const charsets = {
        'ASCII': " .:-=+*#%@".split(''),
        'BINARY': "01".split(''),
        'BLOCKS': " ░▒▓█".split(''),
        'MATRIX': "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ".split('')
    };
    let currentCharsetName = 'ASCII';
    
    const colorModes = ['GREEN', 'AMBER', 'RGB'];
    let currentColorModeIndex = 0;

    let isGlitchActive = false;

    // ASCII 解析度
    const rows = 60; 
    let cols = 0;

    // 遊戲變數
    let isGameActive = false;
    let enemies = [];
    let gameLoopId = null;
    let spawnRate = 2000;
    let lastSpawnTime = 0;
    let lastFrameTime = 0;
    let currentInput = "";
    let score = 0;
    let destroyedRowsCount = 0; // 從底部開始算，被永久刪除的行數
    
    // 爆炸效果 (破壞 GIF 區域)
    // 我們用一個 2D 陣列來儲存每個字符的「損壞程度」
    // 0 = 正常, >0 = 損壞 (顯示為空白或亂碼)
    let damageMap = [];

    // 初始化
    loadGif(currentGifIndex);

    // --- 事件監聽 ---

    nextBtn.addEventListener('click', () => {
        currentGifIndex = (currentGifIndex + 1) % gifFiles.length;
        loadGif(currentGifIndex);
    });

    modeBtn.addEventListener('click', () => {
        const keys = Object.keys(charsets);
        let currentIndex = keys.indexOf(currentCharsetName);
        let nextIndex = (currentIndex + 1) % keys.length;
        currentCharsetName = keys[nextIndex];
        modeBtn.textContent = currentCharsetName;
    });

    colorBtn.addEventListener('click', () => {
        currentColorModeIndex = (currentColorModeIndex + 1) % colorModes.length;
        const mode = colorModes[currentColorModeIndex];
        colorBtn.textContent = mode;
        
        document.body.classList.remove('theme-amber', 'theme-rgb');
        if (mode === 'AMBER') document.body.classList.add('theme-amber');
        if (mode === 'RGB') document.body.classList.add('theme-rgb');
    });

    glitchBtn.addEventListener('click', () => {
        isGlitchActive = !isGlitchActive;
        glitchBtn.textContent = isGlitchActive ? "ON" : "OFF";
        glitchBtn.classList.toggle('off', !isGlitchActive);
        glitchBtn.classList.toggle('active', isGlitchActive);
        
        if (isGlitchActive) {
            asciiOutput.classList.add('ascii-glitch');
        } else {
            asciiOutput.classList.remove('ascii-glitch');
        }
    });

    gameBtn.addEventListener('click', () => {
        if (isGameActive) {
            stopGame();
        } else {
            startGame();
        }
    });

    restartBtn.addEventListener('click', () => {
        gameOverOverlay.style.display = 'none';
        startGame();
    });

    document.addEventListener('keydown', (e) => {
        if (!isGameActive) return;
        
        // 只能輸入字母
        if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
            currentInput += e.key.toUpperCase();
            checkInput();
        } else if (e.key === 'Backspace') {
            currentInput = currentInput.slice(0, -1);
        }
    });

    // --- 遊戲邏輯 ---

    function startGame() {
        isGameActive = true;
        gameBtn.textContent = "STOP";
        gameBtn.classList.add('active');
        enemies = [];
        currentInput = "";
        score = 0;
        destroyedRowsCount = 0;
        spawnRate = 2000;
        lastFrameTime = 0;
        
        scoreDisplay.textContent = `SCORE: ${score}`;
        scoreDisplay.style.display = 'inline';
        gameLayer.innerHTML = '';
        gameOverOverlay.style.display = 'none';
        
        // 重置損壞地圖
        damageMap = new Array(rows * cols).fill(0);

        requestAnimationFrame(gameLoop);
    }

    function stopGame() {
        isGameActive = false;
        gameBtn.textContent = "START";
        gameBtn.classList.remove('active');
        gameLayer.innerHTML = '';
        scoreDisplay.style.display = 'none';
        // 遊戲結束後，損壞地圖會慢慢修復 (在 renderAscii 中處理)
    }

    function gameOver() {
        isGameActive = false;
        gameBtn.textContent = "START";
        gameBtn.classList.remove('active');
        gameLayer.innerHTML = '';
        
        finalScoreDisplay.textContent = score;
        gameOverOverlay.style.display = 'flex';
    }

    function gameLoop(timestamp) {
        if (!isGameActive) return;

        if (!lastFrameTime) lastFrameTime = timestamp;
        const deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        // 生成敵人
        if (timestamp - lastSpawnTime > spawnRate) {
            // 限制螢幕上最多 3 個敵人
            if (enemies.length < 3) {
                spawnEnemy();
            }
            lastSpawnTime = timestamp;
        }

        // 移動敵人
        // 基準速度：60FPS 時每幀移動 0.5% (即每秒 30%)
        // 轉換為時間相關：0.03% per ms
        const moveAmount = 0.03 * deltaTime;

        enemies.forEach((enemy, index) => {
            enemy.y += moveAmount; 
            enemy.element.style.top = `${enemy.y}%`;
            
            // 檢查是否觸底 (撞擊 GIF 區域)
            // 注意：這裡的底部是動態的，隨著 destroyedRowsCount 增加而上升
            // 90% 是原本的底部，現在要減去被破壞的比例
            const currentBottom = 90 - (destroyedRowsCount / rows * 100);

            if (enemy.y > currentBottom) {
                triggerPermanentDamage(enemy.x, enemy.y);
                enemy.element.remove();
                enemies.splice(index, 1);
                currentInput = ""; // 重置輸入防止卡住
            }
        });

        requestAnimationFrame(gameLoop);
    }

    function spawnEnemy() {
        const words = [
            "HACK", "CODE", "DATA", "BYTE", "NULL", "VOID", "ROOT", "USER", "PASS", "FAIL", 
            "SYSTEM", "ERROR", "FATAL", "WARN", "INFO", "DEBUG", "TRACE", "STACK", "HEAP", 
            "BUFFER", "LOGIN", "ACCESS", "DENIED", "GRANT", "PROXY", "SHELL", "BASH", "SUDO", 
            "GREP", "CURL", "PING", "PONG", "ECHO", "EXIT", "VIM", "NANO", "GIT", "PUSH", 
            "PULL", "MERGE", "HEAD", "TAIL", "AWK", "SED", "FIND", "KILL", "PS", "TOP", 
            "FREE", "DF", "DU", "LS", "CD", "PWD", "MKDIR", "RM", "CP", "MV", "TOUCH", 
            "CAT", "LESS", "MORE", "MAN", "HELP", "CLEAR", "RESET", "ALIAS", "EXPORT", 
            "UNSET", "ENV", "SET", "HISTORY", "JOBS", "FG", "BG", "WAIT", "SLEEP", "NICE", 
            "RENICE", "KILLALL", "SHUTDOWN", "REBOOT", "HALT", "POWEROFF", "LOGOUT", "WHO", 
            "W", "ID", "GROUPS", "USERS", "LAST", "UPTIME", "DATE", "CAL", "BC", "EXPR", 
            "TRUE", "FALSE", "YES", "NO", "TEST", "SEQ", "SHUF", "SORT", "UNIQ", "WC", 
            "TR", "CUT", "PASTE", "JOIN", "SPLIT", "CSPLIT", "TEE", "XARGS", "TAR", "GZIP", 
            "GUNZIP", "BZIP2", "XZ", "ZIP", "UNZIP", "SSH", "SCP", "SFTP", "FTP", "TELNET", 
            "NC", "NMAP", "TCPDUMP", "WIRESHARK", "NETSTAT", "SS", "IP", "IFCONFIG", "ROUTE", 
            "DIG", "NSLOOKUP", "HOST", "WHOIS", "WGET", "APT", "YUM", "DNF", "PACMAN", "APK", 
            "BREW", "NPM", "YARN", "PIP", "GEM", "CARGO", "GO", "RUST", "JAVA", "PYTHON", 
            "RUBY", "PERL", "PHP", "HTML", "CSS", "JS", "SQL", "DB", "API", "JSON", "XML"
        ];
        const word = words[Math.floor(Math.random() * words.length)];
        
        const enemy = document.createElement('div');
        enemy.classList.add('word-enemy');
        enemy.textContent = word;
        enemy.style.left = `${Math.random() * 80 + 10}%`; // 隨機水平位置
        enemy.style.top = '0%';
        
        gameLayer.appendChild(enemy);
        
        enemies.push({
            word: word,
            element: enemy,
            x: parseFloat(enemy.style.left),
            y: 0,
            matchedIndex: 0
        });
    }

    function checkInput() {
        // 尋找匹配的敵人
        // 優先匹配已經部分輸入的敵人
        let target = enemies.find(e => e.word.startsWith(currentInput));
        
        if (target) {
            // 更新顯示 (高亮已輸入部分)
            const matched = target.word.substring(0, currentInput.length);
            const rest = target.word.substring(currentInput.length);
            target.element.innerHTML = `<span class="word-matched">${matched}</span>${rest}`;

            // 檢查是否完全匹配
            if (currentInput === target.word) {
                destroyEnemy(target);
                currentInput = "";
            }
        } else {
            // 輸入錯誤，重置
            currentInput = "";
            // 清除所有敵人的高亮
            enemies.forEach(e => {
                e.element.textContent = e.word;
            });
        }
    }

    function destroyEnemy(enemy) {
        // 取得座標
        const gameRect = gameLayer.getBoundingClientRect();
        const enemyRect = enemy.element.getBoundingClientRect();
        
        // 計算相對於 gameLayer 的中心點座標
        const sourceX = gameRect.width / 2;
        const sourceY = gameRect.height; // 底部
        
        const targetX = enemyRect.left + enemyRect.width / 2 - gameRect.left;
        const targetY = enemyRect.top + enemyRect.height / 2 - gameRect.top;

        // 計算角度與距離
        const deltaX = targetX - sourceX;
        const deltaY = targetY - sourceY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90;

        // 發射雷射特效
        const laser = document.createElement('div');
        laser.classList.add('laser-beam');
        laser.style.left = '50%'; 
        laser.style.bottom = '0';
        laser.style.height = `${distance}px`; // 使用像素單位
        laser.style.transform = `rotate(${angle}deg)`;
        
        gameLayer.appendChild(laser);
        
        setTimeout(() => laser.remove(), 100);

        // 移除敵人
        enemy.element.remove();
        enemies = enemies.filter(e => e !== enemy);
        
        // 增加分數
        score++;
        scoreDisplay.textContent = `SCORE: ${score}`;
    }

    function calculateAngle(cx, cy, ex, ey) {
        const dy = ey - cy;
        const dx = ex - cx;
        let theta = Math.atan2(dy, dx); // range (-PI, PI]
        theta *= 180 / Math.PI; // rads to degs, range (-180, 180]
        return theta + 90;
    }

    function triggerPermanentDamage(xPercent, yPercent) {
        // 1. 視覺爆炸特效
        const explosion = document.createElement('div');
        explosion.classList.add('explosion');
        explosion.textContent = "FAHHH";
        explosion.style.left = `${xPercent}%`;
        explosion.style.top = `${yPercent}%`;
        gameLayer.appendChild(explosion);
        setTimeout(() => explosion.remove(), 500);

        // 2. 永久刪除一行 (從底部算起)
        destroyedRowsCount += 1; // 每次被擊中刪除 1 行 (或者更多，看難度)
        
        // 檢查是否 Game Over
        if (destroyedRowsCount >= rows) {
            gameOver();
        }
    }

    // --- 核心邏輯 ---

    function loadGif(index) {
        if (animationId) cancelAnimationFrame(animationId);

        const filename = gifFiles[index];
        if (filenameDisplay) filenameDisplay.textContent = filename.split('.')[0];

        gifContainer.innerHTML = `<img src="gif/${filename}" rel:animated_src="gif/${filename}" rel:auto_play="1" width="200" height="200" id="source-gif" />`;
        const gifImg = document.getElementById('source-gif');

        rubb = new SuperGif({ gif: gifImg, progressbar_height: 0 } );

        rubb.load(() => {
            console.log(`GIF Loaded: ${filename}`);
            const canvas = rubb.get_canvas();
            const ctx = canvas.getContext('2d');
            
            const ratio = canvas.width / canvas.height;
            cols = Math.floor(rows * ratio / 0.6);
            
            // 初始化 damageMap
            damageMap = new Array(rows * cols).fill(0);

            renderAscii(canvas, ctx);
        });
    }

    function renderAscii(canvas, ctx) {
        const smallCanvas = document.createElement('canvas');
        const smallCtx = smallCanvas.getContext('2d');
        
        smallCanvas.width = cols;
        smallCanvas.height = rows;

        function step() {
            if (!rubb.get_playing()) return;

            smallCtx.drawImage(canvas, 0, 0, cols, rows);
            const imageData = smallCtx.getImageData(0, 0, cols, rows);
            const data = imageData.data;
            
            let asciiStr = "";
            const charset = charsets[currentCharsetName];
            const isRGB = colorModes[currentColorModeIndex] === 'RGB';

            // 計算可見的行數範圍
            // 底部 destroyedRowsCount 行將不被渲染
            const visibleRows = rows - destroyedRowsCount;

            for (let y = 0; y < rows; y++) {
                // 如果這行已經被摧毀，就跳過渲染 (顯示空白)
                if (y >= visibleRows) {
                    asciiStr += "\n"; // 保持換行，確保高度一致
                    continue;
                }

                let xOffset = 0;
                if (isGlitchActive && Math.random() > 0.95) {
                    xOffset = Math.floor(Math.random() * 10) - 5;
                }

                for (let x = 0; x < cols; x++) {
                    let targetX = x + xOffset;
                    if (targetX < 0) targetX = 0;
                    if (targetX >= cols) targetX = cols - 1;

                    const offset = (y * cols + targetX) * 4;
                    const r = data[offset];
                    const g = data[offset + 1];
                    const b = data[offset + 2];
                    
                    const avg = (r + g + b) / 3;
                    
                    // 檢查損壞地圖 (這裡保留原本的 damageMap 邏輯，作為額外的視覺效果)
                    const mapIndex = y * cols + x;
                    let isDamaged = false;
                    
                    if (damageMap[mapIndex] > 0) {
                        isDamaged = true;
                        damageMap[mapIndex]--; 
                    }

                    let c;
                    if (isDamaged) {
                        c = Math.random() > 0.5 ? ' ' : charset[Math.floor(Math.random() * charset.length)];
                    } else {
                        const len = charset.length;
                        const charIndex = Math.floor(map(avg, 0, 255, 0, len));
                        c = charset[charIndex] || ' ';
                    }
                    
                    if (isGlitchActive && Math.random() > 0.99) {
                        c = charset[Math.floor(Math.random() * charset.length)];
                    }

                    if (c === " ") c = "&nbsp;";

                    if (isRGB && !isDamaged) {
                        asciiStr += `<span style="color: rgb(${r},${g},${b})">${c}</span>`;
                    } else {
                        asciiStr += c;
                    }
                }
                asciiStr += "\n";
            }

            asciiOutput.innerHTML = asciiStr;
            animationId = requestAnimationFrame(step);
        }
        
        step();
    }

    function map(value, start1, stop1, start2, stop2) {
        return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    }
});