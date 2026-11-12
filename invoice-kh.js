/* 인보이스 → 재고추가(경호) 공용 모듈 (브라우저·node 공용)
 * - 품번 정리(normModel) : 2026년 1~10월 정답 5,882행에서 배운 규칙
 * - 거래처별 추가 파서(BABY, 에랄도, 구에라 …) : pdf.js 줄 배열(pagesLines)을 받아 {model,name,qty,unitPrice,note,brand} 배열을 돌려줌
 * - 합산·합계검증·(경호) 엑셀 만들기
 * 이 파일은 빌드 스크립트(클로드\build_invoice_kh.py)가 규칙 데이터를 끼워 넣어 만든다. 직접 고치지 말고 .src.js를 고칠 것.
 */
(function(root){
  'use strict';
  var SHAPES = {"AAAAAAAAA/AAAAA":[15],"AAAAAAAA/AAAAA":[14],"9AA999A999A9999":[6,4,5],"AA9999AAA9A99A99AA":[8,6,4],"AA9999AAA9A99AAAAA":[8,6,4],"9999999AAA999AA999":[9,5,4],"9A99999AAA99AAA999":[9,5,4],"9A999999AA999AA999":[9,5,4],"99999999AA999AA999":[9,5,4],"AA-A999-999-9":[13],"AAAAAA99999AAA":[5,6,3],"AAAAAA999":[6,3],"AAA999AA9A999A9AAA":[13,5],"9AA999AAAA9999":[6,3,5],"9AA999AA99A9999":[6,4,5],"9AA9999AAAA9999":[6,4,5],"9AA9999A9AA9999":[6,4,5],"9A9999AAAAA9AAA":[6,4,5],"999999AAA999999":[6,5,4],"99-9999999999":[7,6],"99-A999999999":[7,6],"AA9999AAA99999A9999":[9,6,4],"AA99999AA99999A9999":[9,6,4],"9A999A999A9999":[6,3,5],"9999999":[7],"AAA999AA99A9AAA":[6,4,5],"AAA9999A9A9AA9":[6,3,5],"AAA999AA99A9AA9":[6,4,5],"9999999999":[8,2],"9999999A9999A9999":[7,5,5],"9999999A9A99A999A":[7,5,5],"A999999A9999A999A":[7,10],"9999999A9A99A9999":[7,5,5],"AAA999AAAAA9AA9":[6,4,5],"AAA9999AAA9AA9":[6,3,5],"99-99999999999":[7,7],"99-A9999999999":[7,7],"AAA99AA999A9999A":[13,3],"AAA99999A99999999999":[8,7,5],"99A999AAA99AA":[9,4],"999999999A99AA":[10,4],"AA99AA99999AA":[9,4],"AAA99AA999A99999":[13,3],"999999AA999AA":[6,3,4],"999999AAA99AA":[9,4],"999999":[6],"AAA99A999A9999":[11,3],"A9A999A9AA99":[3,3,4,2],"A9A999A9AA999":[3,3,5,2],"A9A999AAAAAAA99":[3,4,6,2],"A9A999AA9AA99":[3,3,5,2],"99-A999":[7],"99-9999":[7],"AAA999A99999999":[7,5,3],"AAAAA999":[5,3],"AAAA999":[4,3],"AAAAAAA999":[7,3],"AAAAAAA":[7],"AA9AA9999A9999A9999":[9,5,5],"9A999AAAAA-AA99A9A99":[9,6,5],"A9A9999AAAAAA99":[3,4,6,2],"AAA999AA9999999":[7,5,3],"9999999AAA9999A999":[9,5,4],"AAAAAAA9999AAA9A99":[11,3,4],"9999999AA999999":[6,5,4],"999999AAA9A9999":[6,5,4],"999999AAAA99999":[6,5,4],"9AA9999AA9A9999":[6,4,5],"9AA999AAAAA9AAA":[6,4,5],"AAAAAAA9999AAAA999":[11,3,4],"9A9A9AA9AAA9AA":[8,3,3],"9AA9999AAAA9A9A":[6,4,5],"9A9999999999999":[5,2,5,3],"9A99999999AA999":[5,2,5,3],"AA9999AAA":[6,3],"AAAA":[4],"9AA999AAA9A9999":[6,4,5],"AA999999A99999A9999":[9,6,4],"AAAAAAAA999AAA9A99":[11,3,4],"99AAAA999A999999A999":[10,7,3],"AAAAAA999A999999A999":[10,7,3],"A9A99A999999A9999A9999":[5,7,5,5],"A9A999999999A9A99A9999":[5,7,5,5],"A9A999999999A9999A9999":[5,7,5,5],"A9A999999999A99A9A9999":[5,7,5,5],"A999AA999":[9],"9A999999999A999":[5,2,5,3],"9A9999999AAA999":[5,2,5,3],"9A9999999AA9999":[5,2,5,3],"9999999A9999A999A":[7,5,5],"AAA999AAA9999999":[6,10],"AAA99AAAA9999999":[6,10],"A9A99AAAA9999999":[6,10],"A99999999AA":[11],"99AAA999A999A999":[16],"AA9A99999A9A99999":[14,3],"AAA9999A9A9":[11],"AAA999AAAA99A":[13],"9999999999999":[10,3],"A99AA9999A9999A9999":[9,5,5],"AA9AA9999A9999AA999":[9,5,5],"AAA999AAA99A":[9,3],"999A999A9999999":[12,3],"9AA999AAA999":[9,3],"A9999AAAA99A":[9,3],"9A9999AAAAA9A9A":[6,4,5],"9999999AAAA9999":[6,5,4],"9A9999A99AA9AA9":[6,4,5],"9999999A9999999":[6,5,4],"999999A9AAA9999":[6,5,4],"AA9999AAA9999":[9,4],"AA9999AAA-A999999":[13,4],"AA999999A9999":[9,4],"AA99999A9999":[8,4],"9A99999999A999A":[5,2,5,3],"9A99999999AA99A":[5,2,5,3],"9A99999999A9999":[5,2,5,3],"9A999AAAAA9999":[6,3,5],"AAAAAAAA999":[8,3],"AAAAAAAAAA999":[10,3],"9AA9999AAAA9A99":[6,4,5],"9A999AA999A9999":[6,4,5],"999999AAAAA9999":[6,5,4],"9AA999AAAAA9999":[6,4,5],"999999999999":[9,3],"9AA999AA99A999A":[6,4,5],"99999999AAA9999":[6,5,4],"9AA999AAA9A9AAA":[6,4,5],"9A9999AAA9A9AA9":[15],"A999A9A99AAA9":[13],"A999A9A9999AA":[13],"99999999999":[8,3],"AA-A999-A9":[10],"AA99AA99999":[4,5,2],"AA-A999-9":[9],"AA999999AA99999AA999":[10,5,5],"AA999999AA99999A9999":[10,5,5],"A9A999A999A99999":[16],"999999999AAAA9":[14],"AA9999AA9":[6,3],"AA9AA9999AAA9":[13],"AA9A99A9999AA":[9,4],"AAA999AAA999":[12],"A99AA9999A9999A99":[17],"A99AA999AAA":[11],"999999999A9999A99":[17],"A9999999":[8],"AA999AAA99999A9999":[8,6,4],"9A99999A999999A":[5,2,5,3],"9A9999A99AA9A9A":[6,4,5],"9A9999AA99A9AA9":[6,4,5],"AAA999AAAAA99AA":[6,4,5],"A9A99AAA9999AAAAAA":[6,8,4],"A9A99AAA9999AA99AA":[6,8,4],"AAA99999-99AAAAA":[11,5],"9999999AA999A-A999":[8,6,4],"AAA99999-999AAAAA":[12,5],"AAA9999-999AAAAA":[11,5],"AAA999999-99AAAAA":[12,5],"AAA9999-99AAAAA":[10,5],"9A99999AAA999AA999":[9,5,4],"9999999AAAA9999-A999":[9,7,4],"AA99AAA999A9A9A":[4,6,5],"AA99AAA999A9AA9":[4,6,5],"AAAAAAA999A9AA9":[4,6,5],"AAA999AA9999":[7,5],"A9999A999A9":[8,3],"A9999A99999":[8,3],"AAAAAAAAA999":[9,3],"99AAAA999999999A999":[9,7,3],"99AAAA999A999999AA99":[10,7,3],"9AA9999AAAA999A":[6,4,5],"AAAAAAAAAAAA999":[12,3],"AAA99A999A99A9":[11,3],"9A9999999AAA99":[5,2,5,2],"9A99999A9999999":[5,2,5,3],"A9A999999999A9A99A999A":[5,7,5,5],"9999AAAAA":[4,5],"9999AAAAAAAAA":[4,4,5],"9999AAA":[4,3],"9999AAAAAAA":[4,2,5],"AAA999AAAAA9AAA":[6,4,5],"AAAAAAA999AAA99":[10,5],"999AAA999AA9999999":[3,6,6,3],"9AA9999AAAA9AAA":[6,4,5],"AAA99AA9A9999999":[6,10],"AAA999A9A9999999":[6,10],"A9AAAAAA999AA999":[11,5],"A9AAAAAA99999999":[11,5],"A9AAAAAA999999":[11,3],"9999AAAAAAAAAAAAAAA":[7,12],"9999AAAAAAAAAAA":[4,11],"9999AAAAAAAAAAAAAAAAAA":[10,12],"9999AAAAAAAAAAAAAAAAAAA":[11,12],"9999AAAAAAAAAAAAAAAAA":[4,17],"9999AAAAAAAAAAAAAA":[4,14],"A999999A9999A9999":[7,5,5],"AAA99999999A9AA999":[11,3,4],"AAA99999999AAAA999":[11,3,4],"AAA99999999A99A999":[11,3,4],"A999999AAAA99A":[14],"AA9999AAA9":[10],"A9A999999AAAA99":[10,5],"A999A9999AAA99":[9,5],"AA99A999999AA":[9,4],"AAA9999999999AA999":[11,3,4],"A99999AA9":[6,3],"99AA99999999":[9,3],"9999999A99A9AA999":[7,5,5],"AAA999999A9999":[6,3,5],"999AAAAA999AA99":[15],"AAA999A99AA9A9A":[6,4,5],"999AAA9999AA999999":[18],"A9999999999":[8,3],"A999999AA99":[7,4],"AA9999999":[6,3],"AAA999AAA":[9],"999999AAA9A":[11],"99999999A99999":[7,7],"9A99999999AA":[5,2,5],"AAA999AAAA":[6,4],"AAA999AAA9":[6,4],"AAAAAA9999":[10],"AAA9999AA":[6,3],"9A9999999A9A":[5,2,5],"9A9999999AAA":[5,2,5],"AAAAAAAAAA":[10],"AAA99AA9AA9":[6,5],"AAA999AAA99":[6,5],"AAAAAAA999AA999":[10,5],"AA9999999AA999":[9,5],"AA9999999AAA99":[9,5],"9999999999A999AAA999":[8,8,4],"A9A999999999A9999A999A":[5,7,5,5],"9A999A9AAAA9999":[6,4,5],"9A999A99AA9999":[6,3,5],"9A9999999A9A99A":[5,2,5,3],"999AAAAAAAAAAAAAAAA":[3,16],"AAA999AAAA999":[13],"999999A9AA99999":[6,5,4],"A9999AAAAAA99A":[14],"AAA999AA9AA9A9A":[6,4,5],"AA9AA999999AA":[13],"AA9AA9AAA99AA":[9,4],"999999999A":[10],"999999AAA":[9],"999A999A9999":[12],"9AA999999A99AA":[9,5],"AA99AA999AAAAA":[9,5],"AA99AA999AAA":[9,3],"AA99AA999AAAA":[9,4],"9AA999A99AAA9":[9,4],"999A99A99999999":[15],"9AA9999A99A9999":[6,4,5],"AA9999A9999AA":[9,4],"A9999AAAAA":[10],"9A9999999A9A999":[5,2,5,3],"A999999AAAA999":[14],"A999999AAAA9AA":[14],"AA9999AA9999AA999":[6,6,5],"9A9999999A99999":[5,2,5,3],"A9A999999999A99A9A9A9A":[5,7,5,5],"999A99999999":[9,3],"9A999999999999A":[5,2,5,3],"A999AA999999":[9,3],"AA9AA9A9999AA":[9,4],"AA9A9999A99AA":[9,4],"A9A999999AA999":[9,5],"AA99A9999AA9999":[10,5],"AA999AAA999A":[5,7],"99999AAA999":[5,3,3],"A9A999999AAA99":[9,5],"A9999999A9AA":[7,5],"A9999999AAAA":[7,5],"A99999999AAA":[7,5],"9AAA99AAA9999":[10,3],"9AAA99AAAA999":[10,3],"AAA999AAA9A9AAA":[6,4,5],"999999AAAAA":[6,5],"AAAAAAAA":[8],"9999999AA999AA999":[8,5,4],"9A999999A999AA999":[8,5,4],"9A99999AA999AA999":[8,5,4],"9999999AAA99AAA999":[18],"AAA999999999":[6,3,3],"A9A999AAA999999":[7,6,2],"AAA999999AA999A":[6,4,5],"AAA999999AA9999":[6,4,5],"999999999A9999A999A":[9,5,5],"AAA-99999AAAAA":[9,5],"AAAAAAA999A9999":[10,5],"99999AAAA99":[8,3],"99999AAA9999AAA9999":[6,9,4],"9AA9999AA9A99AA":[6,4,5],"9AA999AAAAA999A":[6,4,5],"AA999999A9999A9999":[9,5,4],"999999AA99999999":[6,5,5],"AAAAA999999999":[8,3,3],"AAA999AA9999A999":[6,6,4],"AAAAA999A999999":[8,4,3],"AAA999A999999":[6,4,3],"AAA999AAA9999A999":[7,6,4],"9AAA9999A99AA":[9,4],"9AA999AAAA999":[9,4],"9999999AA9A9999":[6,5,4],"A9A999999999A99A9AA999":[5,7,5,5],"999999A9999AA":[9,4],"A99999":[6],"999-AAA9999-AA9999":[18],"999-AAA999-AA9999":[17],"99999":[5],"A9999":[5],"A999999":[7],"A99999999AA9":[7,5],"9999999A99A9A9999":[7,5,5],"A9999AAAAA999":[10,3],"AA999AAA999AAAA":[12,3],"99A9999A9999999":[12,3],"999A99999":[9],"A9A999999999A99A9A999A":[5,7,5,5],"9A9999999AAAA99":[5,2,5,3],"9A9A9AA9AAAA99":[8,3,3],"AAA999A99AA9AA9":[6,4,5],"9AA9999AAAA99AA":[6,4,5],"99999999A999999A999":[7,12],"A9999AAA999AAAA":[5,7,3],"99999999A99AAA999":[8,5,4],"99AA999A9999A999":[12,4],"A9999AAAAAA999":[10,4],"99A999AA999AA":[9,4],"999999999":[6,3],"9A999999A99AAA999":[8,5,4],"9A99999AA99AAA999":[8,5,4],"99AAA9999AAA9A99A99AA":[3,8,6,4],"99AAA9999AAA9A99AAAAA":[3,8,6,4],"99999999":[5,3],"99999999AA9999A999":[9,5,4],"AAAAAAA9999A9AA999":[11,3,4],"99A999A9999AA":[9,4],"999999AAAA9999":[5,5,4],"9AA9999AAA":[6,4],"AA99AA999":[9],"9999999A99AAA9999":[7,5,5],"AAA99AA":[3,4],"AA999AA":[3,4],"A99AAA9":[3,4],"A999AAA":[4,3],"9999999A999":[7,4],"9A9999999":[5,4],"A99999999":[9],"A9A9999999A9999A9999":[5,5,5,5],"A9A9999999A9999A999A":[5,5,5,5],"A9A9999999A9A99A9999":[5,5,5,5],"AA-A9999":[7,1],"999-AAA9999-AA9999999":[18,3],"999-AAA999-AA9999|999999":[21,3],"999-AAA9999-AA9999|999999":[22,3],"999AA999999A":[12],"A9A999A999A|99999999":[6,9,5],"A99999.9AAAA999":[12,3],"AA.A9999":[7,1],"A99AA999|999AAAAA":[12,5],"A99AA999|999AAA":[12,3],"A99AA999AAAAA":[8,5],"AA.AA.AAAA.A":[12],"999AAA999AA9999|999":[3,6,10],"A9A999999999A9999":[5,7,5],"A99AA9999A99999999":[9,6,3],"AAA999999":[9],"A9A999A9AA999A":[6,8],"A9A999A9AA9999":[6,6,2],"A9999999A99":[8,3],"99999999A99":[5,3,3],"A9A999999999A99AAA9999":[5,7,5,5],"9A999999999AA999":[6,2,5,3],"9A9999999A9999A":[5,2,5,3],"A99AAA9A999AAAA":[11,4],"A99AAA9A999AAAAA":[11,5],"9999999AAA99A9A999":[9,5,4],"9A99999AAA9999A999":[9,5,4],"9999999AAAA999AA999":[9,6,4],"9999AAAA":[4,4],"A9999A99A99":[8,3],"A9999A999AA":[8,3],"A99999A99A99":[9,3],"AAA99AA999A999A":[12,3],"AAA999AA9AA9AA9":[6,4,5],"A999AA9A999999":[14],"A999A99A999999":[10,4],"A999999A999999":[14],"999999999AAA9":[13],"AA999AAA9A9AAA":[5,4,5],"A9A99999999A9999A9999":[5,6,5,5],"AAA99AA999A999A9":[13,3],"9999A999999":[8,3],"AAA999999AA/AA":[9,5],"AAA999999A/AAA":[9,5],"AAA99999A/AAA":[8,5],"AAA999999AAAAA":[9,5],"AAA999999AAA":[9,3],"AAA999999AAAA":[9,4],"AA99999AA9999A999":[13,4],"AA99999AA9999A99":[13,3],"AA9AA999AA":[10],"AAA999999A999":[9,4],"AA9999999AA999A":[6,4,5],"AA9999999AA9A9A":[6,4,5],"9A9999AA9AA9A9A":[6,4,5],"9A9999AAA9A9A99":[6,4,5],"99-9999-999999":[14],"99-A999-999999":[14],"A99999A99AA9A999":[6,5,5],"A9999999A":[9],"A99999A99A99A999":[6,5,5],"A999AAA99AA9A999":[6,5,5],"A99999A99AA9A99A":[6,5,5],"9999999AAAA9999A999":[10,5,4],"AA99999AAA9999":[5,4,5],"99A9999999999":[6,7],"999999AA9999999":[6,5,4],"AAA999/A9A9999999":[17],"9A99999999AA/99A":[16],"AA99/AAAAAAAAAAAAA":[18],"AA99/AAAAAAAAAAAAAAAA":[21],"A9999/AAAAAAAAAAA":[17],"AA99/AAAAAAAAAAAA":[17],"AA99/AAAAAAAAAA":[15],"AA99/AAAAAAAAAAAAAAA":[20],"AAAAAA/AAAAAAAAAAA":[18],"AA99/AAAAAAAAAAAAAA":[19],"9999AAA/AAAAAAAAAAAAAAAA":[24],"A9/AAAAAAAAAAAAAAAA":[19],"9999999/A9999A9999":[18],"A999999/A9999A9999":[18],"9999999/A9999A999A":[18],"A999AA99999":[7,4],"AA99AA999999999":[15],"AA99AAA99999999":[15],"AA99AA99AA99999":[15],"AA999999AAA99":[8,5],"999A99A99999":[8,4],"9A99999AAA9A99":[6,3,5],"AA-A999-999AAAAA":[11,5],"AA-A999-999AAA":[11,3],"AA9999??":[6,2],"9AAA99AAAA":[10],"A99AAAA99999":[12],"99AAAA999A":[10],"AA9AA9999A9999":[9,5],"AA9AA9999A99999999":[9,6,3],"A999A99AAA9999":[10,4],"AA99A999-AAA999999":[15,3],"AAA999AAA9A9AA9":[6,4,5],"AA9AA99A9999999":[7,5,3],"999999AAAAA99999":[6,5,5],"9A9A9AA9AAAAAA":[8,3,3],"9A9A9AA9AAA99A":[8,3,3],"9A9A9A99AAA9AA":[8,3,3],"9A9A9A99AAAA99":[8,3,3],"AAA99A99999AA9A999":[11,3,4],"AAA99A9AA99AA9A999":[11,3,4],"9A9A9999AAA9AA":[8,3,3],"9999999A":[8],"999999A":[7],"A99999A99":[9],"9AA99999999":[11],"AAA99999AAAAAAA":[8,7],"AAA99999AAAAAAA/AAAA":[8,12],"AAA99999AAAAAAA/AAAAAAAAA":[8,13,4],"AAA99999AAAAAAAAAAAAA/AAAAAAA":[8,6,15],"AAA99999AAAAAAA/AAAAA":[8,13],"AAAAA999A999":[12],"AAAAA999999":[11],"AAA999AAA9999":[13],"AAA999A999":[10],"AA9A99A9999999AA":[16],"AA-A999-9999":[12],"AAAA99A999999AAA":[16],"A99999A9999A9999":[16],"AAAA99A9999999AA":[16],"AA9A99A9999999":[14],"AAAA99A9999999":[14],"A999999AAAA99":[13],"A999999AAAA9AAA":[15],"A999999AAAA999A":[15],"99AAAA9AAAAA9999":[16],"AAA999AAAAA9A9A":[6,4,5],"AAA999AA99AAAAA":[6,4,5],"AA99999AAAAAA9":[6,3,5],"A9999999A99999A9999":[9,6,4],"AAAA999AA99AAA9999":[7,4,7],"9AA9999AA9A999A":[6,4,5],"9AA9999AA9A9A9A":[6,4,5],"A9999AAA999A9A999":[5,7,5],"AAA999AAAAA99A9":[6,4,5],"AA99A9A99A9999999":[9,5,3],"99A9999AA9A9999":[6,4,5],"99AAAA999A999999":[10,6],"AA9A9999A999999":[12,3],"999999A99AAA9":[9,4],"9A9999999AA99A9":[5,2,5,3],"A9A99A999999A9A99A9999":[5,7,5,5],"AA9A99A99AAA9":[9,4],"99A999A99AAA9":[9,4],"AA999AA999A9999":[10,5],"A9A999999AAA999":[10,5],"9A99999AAA9999":[6,3,5],"9A99999AAAA9999":[6,4,5],"AAAAAAAA999AAAA99":[11,3,3],"AAAAAAA9999AAA9A9":[11,3,3],"AAAAAAA9999A9AA99":[11,3,3],"AAAAAAAA999AAA9A9":[11,3,3],"9A9999A9999":[6,5],"A99AA9999A9999":[9,5],"A99999999AA999":[9,5],"999AAA999999AAAAAAAAAAA":[13,10],"999AAA999999AAAAAAAAAAAA":[13,11],"A999AA999AAAAAAAAA":[9,9],"A999AA999AAAAA":[9,5],"A999AA999AAAA":[9,4],"99AAAA999A-999999A999":[18,3],"9999999AA9999A9999":[8,5,5],"9999999A9A99A9A99":[7,5,5],"AA-A999-999-AAA":[15],"9999999AA9A99A999A":[8,5,5],"AA-9999AAAAAA":[8,2,3],"AA-9999AAA-A":[9,3],"AA999999A99999":[9,5],"AAA999A9999999":[7,4,3],"AAAAAA99999AAAA999":[11,3,4],"9A999AAA99A9999":[6,4,5],"9999999AAAAA":[7,5],"999999AAAAAA":[6,6],"AA999AAAA9999A999":[13,4],"AA99999AA99999999":[13,4],"A9999AAAAAAAAAAAA":[5,7,5],"A9999AAAAAAAAAAA":[5,6,5],"A9999AAAAAAAAAA":[5,6,4],"A9999AAAAAAAAAAAAAA":[5,9,5],"A9999AAAAAAAA":[5,4,4],"A9999AAAAAAAAA":[5,4,5],"A9999AAAAAAAAAAAAAAA":[5,10,5],"A9999AAAAAAAAAAAAA":[5,8,5],"9999.99AAAAAAAAA":[7,4,5],"9999.99AAAAAAAAAAAAA":[7,8,5],"999.99AAAAAAAAA":[6,4,5],"9999.9AAAAAAAAAAAA":[6,7,5],"9999.99AAAAAAAAAA":[7,5,5],"9999.99AAAAAAAAAAAA":[7,7,5],"9999.99AAAAAAAAAAA":[7,6,5],"999.99AAAAAAA":[6,3,4],"999.99AAAAAAAAAAAAA":[6,8,5],"999.99AAAAAAAAAAAA":[6,8,4],"A99AAA9A99AAAAA":[10,5],"A999AA99999A":[8,4],"AAA999A9AA999999":[6,7,3],"AA999999":[8],"99AAA9A9999AA":[9,4],"AA9999AAA9AA9A99AA":[8,6,4],"AA9999AAA9A99A999AA":[8,6,5],"9AA99999AAAA9999":[7,4,5],"AA-A999-999":[11],"AAA999A-99999999":[16],"AAAA99A-99999999":[16],"A9A9999AAAAAAAA":[7,6,2],"AA99999AAA9A99AAAAA":[9,6,4],"9A9999AAAA9999":[6,3,5],"9A999AA99A9999":[6,3,5],"AAA99A/AAA9999999":[17],"AAA999/AAA9999999":[17],"9AA999AAA":[6,3],"9AA999A99":[6,3],"9AA999AA9":[6,3],"9AA999A9A":[6,3],"9A999AAAA":[6,3],"9A999AA99":[6,3],"9AA9999A99":[6,4],"9A999AA999":[6,4],"9AA999A999":[6,4],"9AA999AAAA":[6,4],"9AA999AA99":[6,4],"9A99999A9AAA999":[5,2,5,3],"9A99999999AAA99":[5,2,5,3],"A9AAAAAA9999999":[11,4],"99-A99999999999":[8,7],"9AA999AAAAA9A99":[6,4,5],"AA9999AAA-A9999999A9999":[13,6,4],"9999999AAA":[7,3],"AA99999AAAAAA9AAAAA":[9,6,4],"AA9999AAAAAA9AAAAA":[8,6,4],"AAA9999AAA9AA9AAAAA":[9,6,4],"A9A999AAA9AA99":[8,4,2],"A9A999AAA999A99":[7,6,2],"A9A999A9AA9A":[6,4,2],"A9A999AAA9AA9999":[8,6,2],"A9A999AAA99999":[7,5,2],"A9A999999999A99A9A9A99":[5,7,5,5],"AAA999A9AAA9A9A":[6,4,5],"9A9999AAAA9A99":[6,3,5],"AAA999A9AAA9AA9":[6,4,5],"AAA9999999999":[6,3,4],"9999AAAA999":[8,3],"A99999999999A9999A9999":[5,7,5,5],"A99999999999A9A99A9999":[5,7,5,5],"A9A99A999999A99A9A9999":[5,7,5,5],"A9A99A999999A99A9A9A99":[5,7,5,5],"AA99999AA999999999":[9,5,4],"A99A999999A9A99A9999":[10,5,5],"AAAAAAAAAAAAAAAA":[6,10],"A9999AAAAAAAAAAAAAAAAA":[5,17],"A9999AAAAAAAAAAAAAAAAAA":[5,18],"AAAAAAAAAAAAAAA":[6,9],"99AAAAAAAAAAAAAAAAAAAAA":[5,18],"9999AAAAAAAA":[4,8],"9999AAAAAAAAAA":[4,10],"9999AAAAAAAAAAAAAAAA":[4,16],"9999AAAAAA":[4,6],"AAA999AAAAA9999":[6,4,5],"9999999AA99AAA999":[8,5,4],"9999999999A999A999":[8,6,4],"9999999A99A999A999":[8,6,4],"999999AA99A999A999":[8,6,4],"AAAAA99AA99999999":[13,4],"AAAAA99AA9999A999":[13,4],"AA999AAAA999":[12],"AA999AAAAA999":[13],"AA999AAA999":[11],"AA999AAA9999":[12],"AA999AAAAA99":[12],"AAAAAAAA999AAAA999":[11,3,4],"AAA999AA99999999":[7,5,4],"A99999A9999AA":[9,4],"A9A999A9AAA99":[3,3,5,2],"A9A99A999999A99A9A9A9A":[5,7,5,5],"9999999AAAA":[7,4],"A999A9AAA9A9999":[6,5,4],"99A9999999A999":[10,4],"AA999999A999999999":[9,5,4]};
  var RAWMAP = {"BABY|AAAAAAAAA/AAAAA":[[0,15]],"BEAT|999999AAA9A9999":[[0,6],[6,11],[11,15]],"BEAT|99999999AAA9999":[[0,6],[6,11],[11,15]],"BEAT|9999999A9999999":[[0,6],[6,11],[11,15]],"BEAT|999999AAA99AA":[[0,13]],"BEAT|99999999999999":[[0,8],[11,14]],"BEAT|AA99AA99999":[[0,4],[4,9],[9,11]],"BEAT|AA9999AA-A9A99A99AA":[[0,8],[9,15],[15,19]],"BEAT|AA999999AA99999AA999":[[0,10],[10,15],[15,20]],"BEAT|A9A999A999A99999":[[0,16]],"그루포킴|A99AA999AAA-99":[[0,11]],"비니|AA9999AAA/99999A9999":[[0,9],[10,16],[16,20]],"에랄도|AAA99999-99AAAAA":[[0,11],[11,16]],"에랄도|AAA99999-999AAAAA":[[0,12],[12,17]],"에랄도|AAA999999-99AAAAA":[[0,12],[12,17]],"에랄도|AAA9999-99AAAAA":[[0,10],[10,15]],"에랄도|9A99999AAA999AA999":[[0,9],[9,14],[14,18]],"에랄도|A9999A99999":[[0,8],[8,11]],"구에라|AA9AA9999A9999A9999":[[0,9],[9,14],[14,19]],"그루포킴|9999999":[[0,7]],"그루포킴|999999AAA9A9999":[[0,6],[6,11],[11,15]],"비니|AA9999AAA/9999":[[0,9],[10,14]],"비니|AA999999A/9999":[[0,9],[10,14]],"BEAT|A99999A99999999AA999":[[5,10],[10,12],[12,17],[17,20]],"BEAT|AA9999AAA99999A9999":[[0,9],[9,15],[15,19]],"BEAT|AA999999A99999A9999":[[0,9],[9,15],[15,19]],"BEAT|A99999A99999A9999999":[[5,10],[10,12],[12,17],[17,20]],"그루포킴|AA99A99999AA999":[[5,10]],"그루포킴|AA99AA9999AA999":[[5,10]],"BABY|A999AA999/AAA":[[0,9]],"BABY|A999AA999/AAAAAAAAA":[[0,9]],"BABY|A999AA999/AAAAAAAA":[[0,9]],"BABY|9999999/AAAAA":[[0,7]],"BABY|AAA99A/A9A9999999":[[0,6],[7,17]],"BABY|AAA99A/AAA9999999":[[0,17]],"BABY|AAA999/A9A9999999":[[0,6],[7,17]],"BABY|A9A99A/AAA9999999":[[0,6],[7,17]],"BABY|AAA999/AAA9999999":[[0,6],[7,17]],"BABY|99999999/99":[[0,8],[9,11]],"BABY|9A99999999AA/99A":[[0,5],[5,7],[7,12],[13,16]],"BABY|9A99999999AA/999":[[0,5],[5,7],[7,12],[13,16]],"BABY|9A9999999AAA/999":[[0,5],[5,7],[7,12],[13,16]],"BABY|A9AAAAAA999/AA999":[[0,11],[12,17]],"BABY|A9AAAAAA999/99999":[[0,11],[12,17]],"BABY|A9AAAAAA999/999":[[0,11],[12,15]],"BABY|9999999/A9999A9999":[[0,7],[8,13],[13,18]],"BABY|A999999/A9999A9999":[[0,7],[8,13],[13,18]],"BABY|9999999/A9999A999A":[[0,7],[8,13],[13,18]],"BEAT|AAA99999999A9AA999":[[0,11],[11,14],[14,18]],"그루포킴|AA9999999":[[0,9]],"BABY|A999AA999/AAAAA":[[0,9]],"BABY|9A999999999A/999":[[0,5],[5,7],[7,12],[13,16]],"그루포킴|9999999/A9999":[[0,7]],"그루포킴|99999AAA/999":[[0,5],[5,8],[9,12]],"비니|AAA999999/999":[[0,6],[6,9],[10,13]],"비니|9A99999/99A9A999":[[0,5],[5,7],[8,13],[13,16]],"비니|9A99999/999A9999":[[0,5],[5,7],[8,13],[13,16]],"비니|9A99999/999AA999":[[0,5],[5,7],[8,13],[13,16]],"비니|A9A999A/AA999999":[[0,7],[8,14],[14,16]],"에랄도|A999AA999999":[[0,9],[9,12]],"베네레|9999999AAA999AA999":[[0,9],[9,14],[14,18]],"베네레|9999999AA999AA999":[[0,8],[8,13],[13,17]],"베네레|9999999999999AAAAAAAA999":[[0,10],[21,24]],"베네레|99999999AA999AA999":[[0,9],[9,14],[14,18]],"베네레|9999999AAA9999A999":[[0,9],[9,14],[14,18]],"비니|9A99999/99999999":[[0,5],[5,7],[8,13],[13,16]],"비니|AAA999AA9999/A999":[[0,6],[6,12],[13,17]],"그루포킴|AA99AA999":[[0,9]],"비니|AAA999AA9999/999":[[0,6],[6,12],[13,16]],"비니|9A99999/A9999999":[[0,5],[5,7],[8,13],[13,16]],"비니|9A99999/9999A999":[[0,5],[5,7],[8,13],[13,16]],"비니|9A99999/99AAA999":[[0,5],[5,7],[8,13],[13,16]],"비니|A9A999/A9AA99":[[0,6],[7,11],[11,13]],"비니|A9A9999/AAAAAA99":[[0,7],[8,14],[14,16]],"비니|A9A999/A9AA9999":[[0,6],[7,13],[13,15]],"비니|A9A999A/AAAAAA99":[[0,7],[8,14],[14,16]],"비니|AAAAA999999/999":[[0,8],[8,11],[12,15]],"에랄도|9999AAA":[[0,4],[4,7]],"에랄도|9999AAAAA":[[0,4],[4,9]],"에랄도|AA9999AAA9A99A99AA":[[0,8],[8,14],[14,18]],"에랄도|AA9999AAA9A99AAAAA":[[0,8],[8,14],[14,18]],"에랄도|A99AAA9A999AAAA":[[0,11],[11,15]],"에랄도|A99AAA9A999AAAAA":[[0,11],[11,16]],"에랄도|9999999AA999AA999":[[0,8],[8,13],[13,17]],"에랄도|9A999999A999AA999":[[0,8],[8,13],[13,17]],"에랄도|9A999999A99AAA999":[[0,8],[8,13],[13,17]],"에랄도|9A99999AA99AAA999":[[0,8],[8,13],[13,17]],"에랄도|9A99999AA999AA999":[[0,8],[8,13],[13,17]],"에랄도|9999999AAA999AA999":[[0,9],[9,14],[14,18]],"에랄도|9999999AAA9999A999":[[0,9],[9,14],[14,18]],"에랄도|99999999AA999AA999":[[0,9],[9,14],[14,18]],"에랄도|9999999AAAA999AA999":[[0,9],[9,15],[15,19]],"에랄도|999999AAA999999":[[0,6],[6,11],[11,15]],"에랄도|999999AAAA99999":[[0,6],[6,11],[11,15]],"에랄도|A9999A99A99":[[0,8],[8,11]],"에랄도|A9999A999AA":[[0,8],[8,11]],"BABY|AA99/AAAAAAAAAA":[[0,15]],"그로포킴|9AAA99AAAA-99A":[[0,10]],"그로포킴|99AAAA999A-99":[[0,10]],"비니|9999999/AAAA":[[0,7]],"비니|999999/9A9999999":[[0,6],[7,12],[12,16]],"비니|999999/AAAA99999":[[0,6],[7,12],[12,16]],"비니|AAA999999/A999":[[0,9],[10,14]],"베네레|A99999A99AA9A999":[[0,6],[6,11],[11,16]],"베네레|A99999A99A99A999":[[0,6],[6,11],[11,16]],"베네레|9A99999AA99AAA999":[[0,8],[8,13],[13,17]],"베네레|9A999999A999AA999":[[0,8],[8,13],[13,17]],"베네레|9A99999AA999AA999":[[0,8],[8,13],[13,17]],"베네레|9999999999999AAAAAAAAA999":[[0,10],[22,25]],"베네레|A999999AAAA9AA":[[0,14]],"베네레|A99999999":[[0,6],[6,9]],"베네레|A999999AAAA999":[[0,14]],"베네레|A99999A99AA9A99A":[[0,6],[6,11],[11,16]],"베네레|9999999999999AAAAAA999":[[0,10],[19,22]],"베네레|9999999A":[[0,8]],"베네레|A99999999AA":[[0,11]],"베네레|999999A":[[0,7]],"베네레|A9999999A":[[0,9]],"베네레|A99999A99":[[0,9]],"베네레|9999999AAA99AAA999":[[0,18]],"BABY|9A9999999AA9/9A9":[[0,5],[5,7],[7,12],[13,16]],"BABY|9A9999999A9A/999":[[0,5],[5,7],[7,12],[13,16]],"BABY|A999AA999/AAAA":[[0,9]],"에랄도|A99999999":[[0,6],[6,9]],"에랄도|A9999999A":[[0,6],[6,9]],"에랄도|A99999A99":[[0,6],[6,9]],"에랄도|A9999AAAAAAAAAAAA":[[0,5],[5,12],[12,17]],"에랄도|A9999AAAAAAAAAAA":[[0,5],[5,11],[11,16]],"에랄도|A9999AAAAAAAAAA":[[0,5],[5,11],[11,15]],"에랄도|A9999AAAAAAAAAAAAAA":[[0,5],[5,14],[14,19]],"에랄도|A9999AAAAAAAA":[[0,5],[5,9],[9,13]],"에랄도|A9999AAAAAAAAA":[[0,5],[5,9],[9,14]],"에랄도|A9999AAAAAAAAAAAAA":[[0,5],[5,13],[13,18]],"에랄도|9999.99AAAAAAAAA":[[0,7],[7,11],[11,16]],"에랄도|9999.99AAAAAAAAAAAAA":[[0,7],[7,15],[15,20]],"에랄도|999.99AAAAAAAAA":[[0,6],[6,10],[10,15]],"에랄도|9999.99AAAAAAAAAAAA":[[0,7],[7,14],[14,19]],"에랄도|9999.99AAAAAAAAAAA":[[0,7],[7,13],[13,18]],"에랄도|999.99AAAAAAA":[[0,6],[6,9],[9,13]],"에랄도|999.99AAAAAAAAAAAAA":[[0,6],[6,14],[14,19]],"에랄도|9999999AA999999":[[0,6],[6,11],[11,15]],"에랄도|9999999AAA99AAA999":[[0,9],[9,14],[14,18]],"에랄도|A999AA99999A":[[0,8],[8,12]],"베네레|AA9A99A9999999AA":[[0,16]],"베네레|AA-A999-9999":[[0,12]],"베네레|AAAA99A999999AAA":[[0,16]],"베네레|AAAA99A9999999AA":[[0,16]],"베네레|AA9A99A9999999":[[0,14]],"베네레|9AA99999999":[[0,11]],"베네레|AA9999AAA99999A9999":[[0,19]],"베네레|99AAAA9AAAAA9999":[[0,16]],"베네레|AA999999A99999A9999":[[0,19]],"베네레|9999A999999":[[0,8],[8,11]],"비니|9AA999/AAAAA9999":[[0,6],[7,11],[11,16]],"비니|9A999A/9AAAA9999":[[0,6],[7,11],[11,16]],"비니|9A999A/AAAA9999":[[0,6],[7,10],[10,15]],"비니|999999/999":[[0,6],[7,10]],"BABY|AAA999/AAAAA9A9A":[[0,6],[7,11],[11,16]],"BABY|A99999/999AA":[[0,6],[7,12]],"BEAT|A9A999999999A9A99A9999":[[0,5],[5,12],[12,17],[17,22]],"BEAT|AA9A9999A999999":[[0,12],[12,15]],"비니|999999/AAAAA9999":[[0,6],[7,12],[12,16]],"비니|9999999/AAAAAAAAAA":[[0,7]],"비니|999999/A9AA99999":[[0,6],[7,12],[12,16]],"비니|9999999/AAAAAAAAA":[[0,7]],"비니|AAA999A/99999999":[[0,7],[8,13],[13,16]],"비니|9999999/AAAAA":[[0,7]],"비니|9999999/AAAAAAAAAAAAAAAA":[[0,7]],"비니|9999999/AAAAAAAAAAAA":[[0,7]],"비니|A9A999/A9AA999":[[0,6],[7,12],[12,14]],"비니|A9A999A/AA99999":[[0,7],[8,13],[13,15]],"BABY|9999999/AAAA":[[0,7]],"BABY|AAA999/A9AA999999":[[0,6],[7,14],[14,17]],"BABY|AA999999/AAAA":[[0,8]],"BABY|9A9999999999/999":[[0,5],[5,7],[7,12],[13,16]],"BABY|9A99999999A9/999":[[0,5],[5,7],[7,12],[13,16]],"비니|AA9999/AA9":[[0,6],[7,10]],"BABY|9AA999/AAA":[[0,6],[7,10]],"BABY|9AA999/AA9":[[0,6],[7,10]],"BABY|9AA999/A9A":[[0,6],[7,10]],"BABY|9999999/AAAAAAAAAA":[[0,7]],"BABY|AA999999/AAAAAAAAAA":[[0,8]],"BABY|AA999999/AAAAAAAAA":[[0,8]],"BABY|AA999999/AAAAAAAA":[[0,8]],"BABY|A9AAAAAA999/9999":[[0,11],[12,16]],"비니|999999AAA/99AA":[[0,9],[10,14]],"비니|AA99999AA/99999A9999":[[0,9],[10,16],[16,20]],"비니|9A99999/999AA99A":[[0,5],[5,7],[8,13],[13,16]],"BEAT|AA99999AA99999A9999":[[0,9],[9,15],[15,19]],"BEAT|AA9999999AAA99":[[0,9],[9,14]],"베네레|AA99999AA9999A999":[[0,13],[13,17]],"베네레|AA99999AA99999999":[[0,13],[13,17]],"베네레|AA999AAAA999":[[0,12]],"베네레|AA999AAAAA999":[[0,13]],"베네레|AA999AAA999":[[0,11]]};
  var HAND = [{"name":"L2S 4부","regex":"^(L[12]S\\w\\w)(\\w{7})(S\\w{4})(V\\w{4})$"},{"name":"프라다계 8+6+4","regex":"^([A-Z]{2}\\d{4}[A-Z]{2})([A-Z]\\d[A-Z]\\d{2}[A-Z])(\\w{4})$"},{"name":"20CM 10+7+3","regex":"^(\\d{2}[A-Z]{4}\\d{3}[A-Z])(\\d{6}[A-Z])(\\d{3})$"},{"name":"RC 10+7+3","regex":"^([A-Z]{6}\\d{3}[A-Z])(\\d{6}[A-Z])(\\d{3})$"},{"name":"L10xxx 접두 제거 5+2+5+3","regex":"^L1\\d{3}(\\d[A-Z]\\d{3})(\\d{2})(\\w{5})(\\d{3})$"},{"name":"5+2+5+3","regex":"^(\\d[A-Z]\\d{3})(\\d{2})(\\w{5})(\\d{3})$"},{"name":"8+7+5 (GWF류)","regex":"^([A-Z]{3}\\d{5})([A-Z]\\d{6})(\\d{5})$"},{"name":"6+4+5 (F00xx)","regex":"^(\\w{6})(\\w{4})(F\\d{4})$"},{"name":"9+5+4","regex":"^(\\d{7}[A-Z]{2})([A-Z]\\d{3}\\w)([A-Z]\\d{3})$"},{"name":"NN-XXXX 6~7","regex":"^(\\d{2}-\\w{4})(\\d{6,7})$"},{"name":"10+3","regex":"^(\\d{10})(\\d{3})$"},{"name":"9+3","regex":"^(\\d{9})(\\d{3})$"},{"name":"7자리+색상 제거","regex":"^(\\d{7})[A-Z]\\d{4}$"},{"name":"B126AC 9+3","regex":"^([A-Z]\\d{3}[A-Z]{2}\\d{3})(\\d{3})$"},{"name":"8+2","regex":"^(\\d{8})(\\d{2})$"},{"name":"S26001 6+5","regex":"^([A-Z]\\d{5})(\\d{3}[A-Z]{2})$"},{"name":"6+5+4 (3G001)","regex":"^(\\d{6})(\\d[A-Z]\\d{3})(\\d{4})$"},{"name":"9+3 (710P)","regex":"^(\\d{3}[A-Z]\\d{5})(\\d{3})$"},{"name":"6+5+4 (알파)","regex":"^(\\d{6})([A-Z]{5})(\\d{4})$"},{"name":"품번+색상명","regex":"^(\\d{4,6})([A-Z]{3,})$"},{"name":"PI0046 9+6+4","regex":"^([A-Z]{2}\\d{4}[A-Z]{3})(\\d{5}[A-Z])(\\d{4})$"},{"name":"FJT 7+5+3","regex":"^([A-Z]{3}\\d{3}[A-Z])(\\d{5})(\\d{3})$"},{"name":"6+3+5 (ASK)","regex":"^(\\d[A-Z]{2}\\d{3})([A-Z]{3})(F\\d{4})$"},{"name":"COHIZ 5+6+3","regex":"^([A-Z]{5})([A-Z]\\d{5})([A-Z]{3})$"},{"name":"S6MSJGSH 11+3","regex":"^([A-Z]\\d[A-Z]{4,6}\\d{3})(\\d{3})$"},{"name":"7+5+5","regex":"^(\\d{7})(S\\w{4})(V\\w{4})$"},{"name":"6+3","regex":"^(\\d{6})(\\d{3})$"},{"name":"OW06109 13+4","regex":"^([A-Z]{2}\\w{5}[A-Z]{2}\\d{4})([A-Z]\\d{3})$"},{"name":"L1/숫자+P68","regex":"^(L?\\d{7,8})([A-Z]\\d{2})$"}].map(function(r){ return {name:r.name, rx:new RegExp(r.regex)}; });

  /* ---------- 숫자 ---------- */
  function numEu(s){ // 1.234,56 / 21,20
    if(s==null) return 0; s=String(s).replace(/[€$\s]/g,''); if(!s) return 0;
    var lc=s.lastIndexOf(','), ld=s.lastIndexOf('.');
    if(lc>ld) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(/,/g,'');
    var n=parseFloat(s); return isNaN(n)?0:n;
  }

  /* ---------- 품번 정리 ---------- */
  function shapeOf(c){ return c.replace(/[0-9]/g,'9').replace(/[A-Z]/g,'A'); }
  var FIRST = ['7자리+색상 제거','L1/숫자+P68'];
  // 거래처별 사전 정리: 파서가 준 원시 품번 → 공백 없는 후보
  function pre(vendor, raw){
    var s = String(raw==null?'':raw).toUpperCase().trim();
    var c = s.replace(/\s+/g,'');
    if(vendor==='베네레' || vendor==='쿠미니' || vendor==='갈리아노'){
      var m = c.match(/^(\d{9,10})\d{3}[A-Z]+(\d{3})$/);          // 2619481134600MTCCHLOE008 → 2619481134 008
      if(m) return m[1]+m[2];
      var m2 = c.match(/^(\d{9,10})\d{3}(\d{3})$/);
      if(m2) return m2[1]+m2[2];
    }
    if(vendor==='그루포킴' || vendor==='그로포킴'){
      c = c.replace(/-(\d{2}(?:\.5)?|[SMLX]{1,3}|TU|\d{1,2}[A-Z]?)$/,'');   // 사이즈 꼬리표 제거
    }
    if(vendor==='비니'){
      c = c.replace(/DICM05/,'DIC-M05').replace(/DICMO5/,'DIC-M05');
    }
    return c.replace(/\//g,'');
  }
  // 정답에서 배운 '원시 품번 모양 → 조각 위치' (거래처별, 2번 이상 확인된 것만)
  function learnedModel(vendor, raw){
    var c = String(raw==null?'':raw).toUpperCase().replace(/\s+/g,'');
    var t = RAWMAP[vendor+'|'+shapeOf(c)];
    if(!t) return null;
    for(var i=0;i<t.length;i++) if(t[i][1]>c.length) return null;
    return t.map(function(p){ return c.slice(p[0],p[1]); }).join(' ');
  }
  function normModel(raw, vendor){
    var lm = learnedModel(vendor||'', raw);
    if(lm) return {model:lm, how:'rule', why:'정답에서 배운 모양'};
    var c = pre(vendor||'', raw);
    if(!c) return {model:'', how:'empty'};
    var fix = '';
    if(/^\d{7}O[A-Z]/.test(c)){ c = c.replace(/^(\d{7})O/, '$10'); fix = 'O→0 보정'; }
    var i, m, h;
    for(i=0;i<HAND.length;i++){ h=HAND[i]; if(FIRST.indexOf(h.name)<0) continue; m=c.match(h.rx); if(m) return {model:m.slice(1).join(' '), how: fix?'fix':'rule', why: fix||h.name}; }
    var lens = SHAPES[shapeOf(c)];
    if(lens){ var p=0, out=[]; for(i=0;i<lens.length;i++){ out.push(c.slice(p,p+lens[i])); p+=lens[i]; } return {model:out.join(' '), how: fix?'fix':'rule', why: fix||'형태 학습'}; }
    for(i=0;i<HAND.length;i++){ h=HAND[i]; m=c.match(h.rx); if(m) return {model:m.slice(1).join(' '), how: fix?'fix':'rule', why: fix||h.name}; }
    return {model:String(raw==null?'':raw).toUpperCase().trim().replace(/\//g,' ').replace(/\s+/g,' '), how:'asis', why:'규칙 없음'};
  }

  /* ---------- 같은 품번·단가 합산 ---------- */
  function mergeItems(items, vendor){
    var out=[], idx={};
    items.forEach(function(it){
      var n = normModel(it.model, vendor);
      var key = n.model+'|'+(Math.round((+it.unitPrice||0)*100)/100);
      if(idx[key]!==undefined){ var t=out[idx[key]]; t.qty += (+it.qty||0); t.merged=(t.merged||1)+1; t.raws.push(it.model); }
      else { idx[key]=out.length; out.push({model:n.model, how:n.how, why:n.why, qty:+it.qty||0, price:Math.round((+it.unitPrice||0)*100)/100, origin:it.note||'', mat:it.mat||'', raws:[it.model], merged:1, name:it.name||'', size:it.size||''}); }
    });
    return out;
  }

  /* ---------- 거래처별 추가 파서 ---------- */
  var KH_COUNTRY = /\b(ITALY|ITALIA|PORTUGAL|CHINA|ROMANIA|SPAIN|VIETNAM|TUNISIA|MOROCCO|INDIA|TURKEY|BULGARIA|INDONESIA|CAMBODIA|BANGLADESH|THAILAND|FRANCE|GERMANY|CROATIA|MOLDOVA|HUNGARY|POLAND|UNITED KINGDOM)\b/i;
  function lineOf(l){ return String(l==null?'':l).trim(); }

  // BABY (MSGM 키즈 등): "코드/색상 Abbigliamento T-shirt MSGM Italy 4 21,20 10,0% 23,32 93,28 ES 8A #AN 1 1 1 1"
  var BABY_PAT = /^([A-Z0-9][A-Z0-9\-]*\/[A-Z0-9\-]+\*?|[A-Z0-9]{6,}\*?)\s+(.+?)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s*%\s+([\d.,]+)\s+([\d.,]+)\b/;
  function parseBaby(pagesLines){
    var items=[];
    pagesLines.forEach(function(lines){
      for(var i=0;i<lines.length;i++){
        var m = BABY_PAT.exec(lineOf(lines[i]));
        if(!m) continue;
        var qty=parseInt(m[3],10), net=numEu(m[6]), amount=numEu(m[7]);
        if(net>0){ var d=Math.round(amount/net); if(d>0 && Math.abs(d*net-amount) < Math.abs(qty*net-amount)) qty=d; }
        var desc=m[2], j=i+1, buf=[];
        while(j<lines.length && j<i+5 && !BABY_PAT.test(lineOf(lines[j]))){ buf.push(lineOf(lines[j])); j++; }
        var jn=buf.join(' '); var mm=/Made In:?\s*([A-Za-z ]+)/.exec(jn);
        items.push({model:m[1].replace(/\*$/,''), name:(desc+' '+jn.split('Customs')[0]).trim(), qty:qty, unitPrice:net, note: mm?mm[1].trim():'', brand:''});
        i=j-1;
      }
    });
    return items;
  }

  // 에랄도: "7526825 DRAGON DIFFUSION 8011 TAN SS26 Italy 5,00 108,00 540,00"
  var ERALDO_PAT = /^(\d{6,8})\s+(.+?)\s+(?:((?:SS|FW|AW|PE|AI)\d{2})\s+)?([A-Za-z]+(?: [A-Za-z]+)?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;
  function eraldoModel(desc){
    var toks = desc.trim().split(/\s+/);
    var k=0; while(k<toks.length && !/\d/.test(toks[k])) k++;              // 브랜드·품종 단어 건너뛰기
    toks = toks.slice(k);
    if(toks.length>=2 && /^[A-Z]{2}\d{4}[A-Z]{2}$/.test(toks[1]) && !/^[A-Z]{2}\d{4}[A-Z]{2}$/.test(toks[0])){ var t=toks[0]; toks[0]=toks[1]; toks[1]=t; }   // C3G01E MA0007FB → MA0007FB C3G01E
    return toks.join(' ');
  }
  function parseEraldo(pagesLines){
    var items=[];
    pagesLines.forEach(function(lines){
      for(var i=0;i<lines.length;i++){
        var m = ERALDO_PAT.exec(lineOf(lines[i]));
        if(!m) continue;
        var qty=Math.round(numEu(m[5])), cost=numEu(m[6]), amt=numEu(m[7]);
        if(cost>0){ var d=Math.round(amt/cost); if(d>0 && Math.abs(d*cost-amt) < Math.abs(qty*cost-amt)) qty=d; }
        items.push({model:eraldoModel(m[2]), name:m[2], qty:qty, unitPrice:cost, note:m[4].trim(), brand:''});
      }
    });
    return items;
  }

  // 구에라: "S56UI0140P4455T8013 PORTAFOGLI IT 6 189,00 5% € 198,45 € 1.190,70"
  var GUERRA_PAT = /^([A-Z0-9]{8,24})\s+(.+?)\s+([A-Z]{2})\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)%\s+€?\s*([\d.,]+)\s+€?\s*([\d.,]+)\s*$/;
  function parseGuerra(pagesLines){
    var items=[];
    pagesLines.forEach(function(lines){
      lines.forEach(function(l){
        var m=GUERRA_PAT.exec(lineOf(l)); if(!m) return;
        var qty=parseInt(m[4],10), price=numEu(m[7]), amt=numEu(m[8]);
        if(price>0){ var d=Math.round(amt/price); if(d>0 && Math.abs(d*price-amt) < Math.abs(qty*price-amt)) qty=d; }
        items.push({model:m[1], name:m[2], qty:qty, unitPrice:price, note:m[3], brand:''});
      });
    });
    return items;
  }


  // 범용: 전용 파서가 없는 거래처용. "수량 단가 금액"(수량×단가=금액)이 맞아떨어지는 줄만 품목으로 본다.
  function numTok(t){ var s=String(t).replace(/[€$]/g,''); if(!/^\d[\d.,]*$/.test(s)) return null; return numEu(s); }
  function okAmount(q,p,a){ return q>0 && p>0 && Math.abs(q*p-a) <= Math.max(0.06, a*0.0006); }
  function genericCode(toks, stopIdx, startIdx){
    var out=[], i=startIdx;
    for(; i<stopIdx; i++){
      var t=toks[i];
      if(!out.length){ if(/\d/.test(t) || (/^[A-Z0-9\/\-]{5,}$/.test(t))) out.push(t); else break; }
      else if(/\d/.test(t) && t.length<=8 && !/^\d[\d.,]*%?$/.test(t)) out.push(t);
      else break;
    }
    return out.join(' ');
  }
  function parseGeneric(pagesLines){
    var items=[];
    pagesLines.forEach(function(lines){
      lines.forEach(function(l){
        var raw=lineOf(l); if(raw.length<14) return;
        var toks=raw.split(/\s+/).filter(function(t){ return !/^[€$]$/.test(t); });
        var nums=[]; toks.forEach(function(t,i){ var v=numTok(t); if(v!==null) nums.push({i:i,v:v}); });
        var q=null,p=null,a=null,codeStart=0,stop=0;
        // A) 수량 단가 금액 연속
        for(var k=nums.length-3;k>=0;k--){
          var n0=nums[k],n1=nums[k+1],n2=nums[k+2];
          if(n1.i===n0.i+1 && n2.i===n1.i+1 && Math.abs(n0.v-Math.round(n0.v))<1e-9 && okAmount(n0.v,n1.v,n2.v)){ q=n0.v;p=n1.v;a=n2.v;stop=n0.i; break; }
        }
        // B) 맨 앞이 수량, 끝에 단가 금액
        if(q===null && nums.length>=3 && nums[0].i===0 && Math.abs(nums[0].v-Math.round(nums[0].v))<1e-9){
          var n1b=nums[nums.length-2], n2b=nums[nums.length-1];
          if(n2b.i===n1b.i+1 && okAmount(nums[0].v,n1b.v,n2b.v)){ q=nums[0].v;p=n1b.v;a=n2b.v;codeStart=1;stop=n1b.i; }
        }
        if(q===null) return;
        if(!codeStart && /^\d{1,2}$/.test(toks[0]) && toks.length>stop && stop>2) codeStart=1;   // "1 L1954…" 같은 줄 앞 번호
        var code=genericCode(toks, stop, codeStart); if(!code) return;
        if(/^(TOTAL|TOTALE|IMPONIBILE|IVA)/i.test(code)) return;
        var cm=raw.match(KH_COUNTRY);
        items.push({model:code, name:toks.slice(codeStart+1,stop).join(' '), qty:Math.round(q), unitPrice:p, note:cm?cm[1]:'', brand:''});
      });
    });
    return items;
  }
  function withFallback(fn){ return function(pl){ var r=fn(pl); return (r && r.length) ? r : parseGeneric(pl); }; }

  // 1년(2026) 인보이스가 10건 이상인 거래처만 전용 파서를 둔다 (사용자 방침: 10건 미만 거래처는 파서로 넣지 않고 "직접 입력"으로 처리).
  // 기존 인보이스 자동인식에 있는 8곳 + 추가 2곳(BABY 27건, 에랄도 11건)이 대상.
  var EXTRA = {
    'BABY': {label:'BABY', parse:withFallback(parseBaby)},
    '에랄도': {label:'ERALDO', parse:withFallback(parseEraldo)}
  };
  // 같은 거래처의 다른 표기 (파일 이름 앞 글자)
  var ALIAS = {'그로포킴':'그루포킴', '그루포':'그루포킴'};
  // 파일 이름 앞 글자로 거래처 찾기 (대소문자·'UNO' 같은 영문명 포함)
  function vendorFromName(filename, existingKeys){
    var base = String(filename).replace(/^.*[\\\/]/,'');
    if(/패킹|packing/i.test(base)) return null;
    var up = base.toUpperCase(), k, i;
    var al = Object.keys(ALIAS);
    for(i=0;i<al.length;i++){ if(up.indexOf(al[i].toUpperCase())===0) return ALIAS[al[i]]; }
    var keys = (existingKeys||[]).concat(Object.keys(EXTRA));
    for(i=0;i<keys.length;i++){ k=keys[i]; if(up.indexOf(k.toUpperCase())===0) return k; }
    return null;
  }

  /* ---------- 합계 검증 ---------- */
  function sums(items){ var q=0,a=0; items.forEach(function(r){ var n=+r.qty, p=+r.price; if(isFinite(n)){ q+=n; if(isFinite(p)) a+=n*p; } }); return {qty:q, amount:Math.round(a*100)/100}; }


  /* ---------- 인보이스 자체 합계 검증 ----------
   * 문서에 찍힌 총액(TOTALE·TOTAL·IMPONIBILE·Taxable·Total invoice 등)이 읽은 품목의 수량×단가 합과 맞는지 본다.
   * 맞으면 "검증 통과"(자동 확정 후보), 안 맞으면 "검토 필요". 총액을 못 찾으면 "확인 불가".
   */
  var TOTAL_KEY = /(TOTALE|TOTAL|IMPONIBILE|TAXABLE|TOTALI|AMOUNT DUE|NET AMOUNT|NETTO)/i;
  function docTotals(pagesLines){
    var out=[], seen={};
    pagesLines.forEach(function(lines){
      for(var i=0;i<lines.length;i++){
        var l=lineOf(lines[i]); if(!TOTAL_KEY.test(l)) continue;
        var seg=l+' '+lineOf(lines[i+1]||'');
        (seg.match(/\d[\d.,]*\d/g)||[]).forEach(function(t){ var v=numEu(t); if(v>=20 && !seen[v]){ seen[v]=1; out.push(v); } });
      }
    });
    return out;
  }
  function checkTotal(items, totals, tol){
    var sum=0; items.forEach(function(it){ sum += (+it.qty||0)*(+it.unitPrice||+it.price||0); });
    sum=Math.round(sum*100)/100;
    if(!totals || !totals.length) return {status:'none', sum:sum};
    var best=null; totals.forEach(function(t){ var d=Math.abs(t-sum); if(best===null||d<best.diff) best={total:t,diff:d}; });
    var ok = best.diff <= Math.max(tol||0.5, sum*0.0005);
    return {status: ok?'ok':'bad', sum:sum, total:best.total, diff:Math.round(best.diff*100)/100};
  }


  /* ---------- (경호) 양식 그대로 내려받기 (ExcelJS) ----------
   * 기준: 2026.11.05 재고추가(경호).xlsx 의 서식 — 맑은 고딕 10, 가운데 정렬, 얇은 테두리, 제목(16pt 굵게, A:D 두 줄 병합),
   * 머리글 색(A-D 노랑 / E-V 하늘 / W·X 주황), 합계 줄(C·W·Y 연보라 굵게, Z 노랑), 구역 사이 하늘색 가는 줄, 맨 위 검은 줄,
   * D열 중복 품번 연분홍 강조, 열 너비·확대 85%.
   */
  var EUR_NF = '_-[$€-2]\\ * #,##0.00_-;\\-[$€-2]\\ * #,##0.00_-;_-[$€-2]\\ * "-"??_-;_-@_-';
  var WON_NF = '_-[$₩-412]* #,##0_-;\\-[$₩-412]* #,##0_-;_-[$₩-412]* "-"??_-;_-@_-';
  var KH_NCOL = 31;      // A..AE
  var KH_WIDTHS = {1:9.375, 2:9.375, 3:9, 4:32.375, 23:9, 24:10.75, 25:15, 26:11.125, 27:12.25, 28:17.75, 29:14.5, 30:12, 31:9.25, 32:44, 33:26};
  function buildWorkbook(ExcelJS, sections){
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Sheet1', {views:[{zoomScale:85}]});
    wb.addWorksheet('Sheet2'); wb.addWorksheet('Sheet3');
    ws.properties.defaultRowHeight = 13.5;
    for(var ci=1; ci<=33; ci++){ ws.getColumn(ci).width = (ci>=5 && ci<=22) ? 4.625 : (KH_WIDTHS[ci] || 9); }
    var THIN = {style:'thin'};
    var BORDER = {top:THIN, left:THIN, bottom:THIN, right:THIN};
    function solid(rgb){ return {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+rgb}}; }
    function fmtFor(c){ return (c===24||c===25||(c>=26&&c<=28)) ? EUR_NF : (c===29 ? WON_NF : 'General'); }
    // 한 줄을 표 모양(얇은 테두리·가운데·맑은 고딕 10)으로 칠한다
    function gridRow(rn, upto){
      var row = ws.getRow(rn);
      for(var c=1; c<=(upto||KH_NCOL); c++){
        var cell = row.getCell(c);
        cell.font = {name:'맑은 고딕', size:10};
        cell.alignment = {horizontal:'center', vertical:'middle'};
        cell.border = BORDER;
        cell.numFmt = fmtFor(c);
      }
      return row;
    }
    function put(rn, col, v, extra){
      var cell = ws.getRow(rn).getCell(col);
      cell.value = v;
      if(extra){ if(extra.bold) cell.font = {name:'맑은 고딕', size:extra.size||10, bold:true}; if(extra.fill) cell.fill = solid(extra.fill); if(extra.nf) cell.numFmt = extra.nf; }
      return cell;
    }
    var r = 2;
    sections.forEach(function(sec, si){
      if(si === 0){
        var band = gridRow(1, KH_NCOL); band.height = 1.5;
        for(var c0=1; c0<=KH_NCOL; c0++) band.getCell(c0).fill = solid('000000');
      }
      // 제목 두 줄
      var t1 = ws.getRow(r), t2 = ws.getRow(r+1);
      for(var c1=1; c1<=KH_NCOL; c1++){
        [t1,t2].forEach(function(rw, k){
          var cell = rw.getCell(c1);
          cell.font = {name:'맑은 고딕', size:(c1<=4?11:10), bold:(c1>=5)};
          cell.alignment = {vertical:'middle'};
          cell.numFmt = '@';
          var b = {};
          if(c1<=4){ b.top = k===0?THIN:undefined; b.bottom = k===1?THIN:undefined; if(c1===1) b.left = THIN; if(c1===4) b.right = THIN; }
          else { b.top = THIN; b.bottom = THIN; if(c1===5||c1===13) b.left = THIN; if(c1===12) b.right = THIN; }
          cell.border = b;
        });
      }
      ws.mergeCells(r, 1, r+1, 4);
      var tc = ws.getRow(r).getCell(1);
      tc.value = sec.title; tc.font = {name:'맑은 고딕', size:16, bold:true}; tc.alignment = {horizontal:'center', vertical:'middle'}; tc.numFmt = '@';
      tc.border = BORDER;
      ws.getRow(r).getCell(5).value = '* 특이사항';
      ws.getRow(r+1).getCell(5).value = '컨트롤자 : ';
      // 빈 줄 + 머리글
      gridRow(r+2);
      var h = r+3, hr = gridRow(h);
      var heads = {1:'BRAND', 2:'BRAND', 3:'INV. QTY', 4:'MODEL', 5:'TU', 23:'TOTAL', 24:'UNIT PRICE', 25:'EXTENDED PRICE ', 26:'시즌', 27:'작업여부', 28:'원산지', 29:'소재', 30:'비고', 31:'비고'};
      Object.keys(heads).forEach(function(k){ hr.getCell(+k).value = heads[k]; });
      for(var c2=1; c2<=4; c2++) hr.getCell(c2).fill = solid('FFFF00');
      for(var c3=5; c3<=22; c3++) hr.getCell(c3).fill = solid('00B0F0');
      hr.getCell(23).fill = solid('FFC000'); hr.getCell(24).fill = solid('FFC000');
      // 품목
      var first = h+1, row = first, totQty = 0;
      sec.items.forEach(function(it){
        var rw = gridRow(row);
        rw.getCell(4).numFmt = '@';
        rw.getCell(3).value = it.qty; totQty += (+it.qty||0);
        rw.getCell(4).value = String(it.model);
        rw.getCell(23).value = {formula:'SUM(E'+row+':V'+row+')', result:0};
        rw.getCell(24).value = it.price;
        rw.getCell(25).value = {formula:'X'+row+'*W'+row, result:0};
        if(it.origin) rw.getCell(28).value = it.origin;
        if(it.mat) rw.getCell(29).value = it.mat;
        row++;
      });
      var blank = row; gridRow(blank);           // 합계 범위에 들어가는 빈 줄
      var sr = blank+1, srow = gridRow(sr);
      [3,23,25].forEach(function(c){ srow.getCell(c).font = {name:'맑은 고딕', size:10, bold:true}; srow.getCell(c).fill = solid('B3A2C7'); });
      srow.getCell(26).font = {name:'맑은 고딕', size:10, bold:true}; srow.getCell(26).fill = solid('FFFF00');
      srow.getCell(27).font = {name:'맑은 고딕', size:10, bold:true}; srow.getCell(28).font = {name:'맑은 고딕', size:10, bold:true};
      srow.getCell(3).value = {formula:'SUM(C'+first+':C'+blank+')', result:totQty};
      srow.getCell(23).value = {formula:'SUM(W'+first+':W'+blank+')', result:0};
      srow.getCell(25).value = {formula:'SUM(Y'+first+':Y'+blank+')', result:0};
      gridRow(sr+1);
      var tr = gridRow(sr+2);                               // 인보이스 총액을 손으로 적는 줄(있으면 채워 줌)
      if(typeof sec.total === 'number' && isFinite(sec.total)) tr.getCell(25).value = sec.total;
      gridRow(sr+3); gridRow(sr+4);
      // 중복 품번 강조 (D열)
      if(sec.items.length){
        ws.addConditionalFormatting({ref:'D'+first+':D'+blank, rules:[{type:'expression', priority:1, formulae:['AND($D'+first+'<>"",COUNTIF($D$'+first+':$D$'+blank+',$D'+first+')>1)'], style:{font:{color:{argb:'FF9C0006'}}, fill:{type:'pattern', pattern:'solid', bgColor:{argb:'FFFFC7CE'}}}}]});
      }
      // 다음 구역 앞 하늘색 가는 줄
      var next = sr+6;
      if(si < sections.length-1){
        var sep = gridRow(sr+5, 29); sep.height = 2.25;
        for(var c4=1; c4<=29; c4++) sep.getCell(c4).fill = solid('00B0F0');
      }
      r = next;
    });
    return wb;
  }

  /* ---------- (경호) 엑셀 (SheetJS용 예비) ---------- */
  function buildSheet(XLSX, sections){
    var ws={}, merges=[], r=2, maxRow=1;
    function put(a,v,f){ ws[a] = f ? {t:'n', f:f} : (typeof v==='number' ? {t:'n', v:v} : {t:'s', v:String(v)}); }
    sections.forEach(function(s){
      put('A'+r, s.title); merges.push({s:{r:r-1,c:0}, e:{r:r,c:3}});
      put('E'+r,'* 특이사항'); put('E'+(r+1),'컨트롤자 : ');
      var h=r+3;
      [['A','BRAND'],['B','BRAND'],['C','INV. QTY'],['D','MODEL'],['E','TU'],['W','TOTAL'],['X','UNIT PRICE'],['Y','EXTENDED PRICE '],['Z','시즌'],['AA','작업여부'],['AB','원산지'],['AC','소재'],['AD','비고'],['AE','비고']].forEach(function(p){ put(p[0]+h,p[1]); });
      var row=h+1, first=row;
      s.items.forEach(function(it){
        put('C'+row, it.qty); put('D'+row, it.model);
        put('W'+row, null, 'SUM(E'+row+':V'+row+')'); put('X'+row, it.price); put('Y'+row, null, 'X'+row+'*W'+row);
        if(it.origin) put('AB'+row, it.origin); if(it.mat) put('AC'+row, it.mat);
        row++;
      });
      row++;
      put('C'+row, null, 'SUM(C'+first+':C'+(row-1)+')'); put('W'+row, null, 'SUM(W'+first+':W'+(row-1)+')'); put('Y'+row, null, 'SUM(Y'+first+':Y'+(row-1)+')');
      maxRow=row; r=row+6;
    });
    ws['!ref']='A1:AE'+(maxRow+2); ws['!merges']=merges;
    var cols=[{wch:9},{wch:9},{wch:9},{wch:26},{wch:5}]; for(var i=0;i<17;i++) cols.push({wch:4});
    ws['!cols']=cols.concat([{wch:9},{wch:11},{wch:15},{wch:11},{wch:10},{wch:11},{wch:11},{wch:10},{wch:10}]);
    return ws;
  }

  var KH = {normModel:normModel, mergeItems:mergeItems, parsers:(function(){ var o={}; Object.keys(EXTRA).forEach(function(k){ o[k]=EXTRA[k].parse; }); return o; })(), EXTRA:EXTRA, vendorFromName:vendorFromName, sums:sums, docTotals:docTotals, checkTotal:checkTotal, buildSheet:buildSheet, buildWorkbook:buildWorkbook, numEu:numEu, SHAPES:SHAPES};
  if(typeof module!=='undefined' && module.exports) module.exports = KH; else root.KH = KH;
})(typeof window!=='undefined' ? window : this);
