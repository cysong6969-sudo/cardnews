# Cardnews

바닐라 HTML/CSS/JS로 만든 미니 웹 프로젝트 모음. 각 폴더는 빌드 없이 `index.html`을 브라우저로 열면 바로 실행된다.

## 프로젝트

| 폴더 | 설명 |
| --- | --- |
| [art-playground](art-playground/index.html) | 슬라이더로 조정하는 제너레이티브 아트(플로우 필드, 스피로그래프, 궤도 입자) 캔버스, PNG 저장 지원 |
| [beat-sequencer](beat-sequencer/index.html) | Web Audio API로 즉석 합성한 드럼 사운드를 사용하는 16스텝 비트 시퀀서 |
| [number-puzzle](number-puzzle/index.html) | 방향키/스와이프로 조작하는 2048 숫자 퍼즐 |
| [pomodoro-tracker](pomodoro-tracker/index.html) | 할 일 목록과 연동되는 포모도로 타이머 |

## 실행 방법

별도 설치나 빌드 과정 없이, 각 폴더의 `index.html`을 브라우저에서 열면 된다.

```bash
# 예: art-playground 실행
start art-playground/index.html   # Windows
open art-playground/index.html    # macOS
```

## 데이터 저장

`number-puzzle`(최고 점수), `pomodoro-tracker`(할 일/통계), `beat-sequencer`(저장된 패턴)는 `localStorage`를 사용해 브라우저에 데이터를 보관한다.
