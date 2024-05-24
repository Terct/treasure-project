const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();
const moment = require('moment-timezone');
const fs = require('fs').promises;
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const { Console } = require('console');


const app = express();

const port = 22222

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());




//=----------------------FUNÇÕES GERAIS----------------------=//

function converterParaData(dateString) {
    const [dia, mes, ano] = dateString.split('/');
    return new Date(ano, mes - 1, dia); // Note que o mês é indexado de 0 a 11 no objeto Date
}

function formatarDataParaString(data) {
    // Verifique se a entrada é uma string e tente convertê-la em um objeto Date
    if (typeof data === 'string') {
        data = new Date(data);
    }

    // Certifique-se de que 'data' é um objeto Date válido
    if (isNaN(data)) {
        throw new Error('Data inválida');
    }

    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0'); // Lembre-se que os meses são indexados de 0 a 11
    const ano = data.getFullYear();

    return `${dia}/${mes}/${ano}`;
}


function filterContentsByTitle(array, titleValue, combineDate, columnTitle, columnDate) {
    const anoRegex = /\b\d{4}\b/; // Expressão regular para encontrar um padrão de quatro dígitos
    const ano = titleValue.match(anoRegex)[0];
    const titulo = titleValue.replace(anoRegex, "").trim();
    var filteredArray = []

    if (combineDate) {
        filteredArray = array.filter(item => {
            // Verificar se o 'Tipo Titulo' é igual ao título fornecido e se o ano do 'Data Vencimento' é igual ao ano fornecido
            return item[columnTitle] === titulo && item[columnDate].endsWith(ano);
        });
    } else {

        filteredArray = array.filter(item => {
            // Verificar se o 'Tipo Titulo' é igual ao título fornecido e se o ano do 'Data Vencimento' é igual ao ano fornecido
            return item[columnTitle] === titulo
        });


    }


    return filteredArray;
}

function filterByDateRange(contents, startDate, endDate, column, filterType = 'day') {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (filterType === 'day') {
        // Ajustar as datas para o mesmo horário (00:00:00)
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    } else if (filterType === 'month') {
        // Ajustar para o primeiro dia do mês para a data de início
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        // Ajustar para o último dia do mês para a data de término
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
    }

    return contents.filter(item => {
        // Convertendo as datas de 'Data Vencimento' em objetos Date
        const dataVencimentoParts = item[column].split('/');
        const year = parseInt(dataVencimentoParts[2]);
        const month = parseInt(dataVencimentoParts[1]) - 1; // Mês começa em 0 no objeto Date
        const day = parseInt(dataVencimentoParts[0]);
        const dataVencimento = new Date(year, month, day);

        if (filterType === 'day') {
            // Ajustar a data de vencimento para o mesmo horário (00:00:00)
            dataVencimento.setHours(0, 0, 0, 0);
            // Retorna true se a data de vencimento estiver dentro do intervalo
            return dataVencimento >= start && dataVencimento <= end;
        } else if (filterType === 'month') {
            // Apenas comparando mês e ano
            const startMonthYear = new Date(start.getFullYear(), start.getMonth(), 1);
            const endMonthYear = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            const dataVencimentoMonthYear = new Date(dataVencimento.getFullYear(), dataVencimento.getMonth(), 1);
            return dataVencimentoMonthYear >= startMonthYear && dataVencimentoMonthYear <= endMonthYear;
        }
    });
}

async function getGraphicToDate(data, columnDate, columnAxisY, replacePriceFormate) {
    // Arrays para armazenar os valores de "Taxa Compra Manha" e "PU Compra Manha"
    const arrayData = [];

    // Transforme o array recebido no formato desejado
    const result = data.map(item => {
        // Convertendo as datas de 'Data Vencimento' em objetos Date
        const dataVencimentoParts = item[columnDate]
        const date = converterParaData(dataVencimentoParts)

        const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;


        if (replacePriceFormate) {
            arrayData.push({
                x: formattedDate,
                y: parseFloat(item[columnAxisY].replace(',', '.'))
            })
        } else {
            arrayData.push({
                x: formattedDate,
                y: parseFloat(item[columnAxisY])
            })
        }

        return
    });

    // Ordene o array pelo campo x (data)
    result.sort((a, b) => {
        const [dayA, monthA, yearA] = a.x.split('/').map(Number);
        const [dayB, monthB, yearB] = b.x.split('/').map(Number);
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateA - dateB;
    });

    return arrayData
}

function splitToQuarts(array) {

    // Calculando o tamanho de cada quartil
    const tamanhoQuartil = Math.floor(array.length / 4);

    // Dividindo o array em quartis
    const quartil1 = array.slice(0, tamanhoQuartil);
    const quartil2 = array.slice(tamanhoQuartil, tamanhoQuartil * 2);
    const quartil3 = array.slice(tamanhoQuartil * 2, tamanhoQuartil * 3);
    const quartil4 = array.slice(tamanhoQuartil * 3);

    return [quartil1, quartil2, quartil3, quartil4];
}

function findDataByTypeAndColumn(dataArray, columnName, targetDate, searchType, direction) {
    const formatDate = (date, type) => {
        const [day, month, year] = date.split('/');
        if (type === 'dd/mm/yyyy') return { day: parseInt(day), month: parseInt(month), year: parseInt(year) };
        if (type === 'mm/yyyy') return { month: parseInt(month), year: parseInt(year) };
        return { year: parseInt(year) };
    };

    const isMatch = (itemDate, targetDate, type) => {
        const formattedItemDate = formatDate(itemDate, type);
        const formattedTargetDate = formatDate(targetDate, type);

        for (const key in formattedTargetDate) {
            if (formattedTargetDate[key] !== formattedItemDate[key]) {
                return false;
            }
        }
        
        // Check if all fields (day, month, year) match
        if (type === 'dd/mm/yyyy') {
            return formattedItemDate.day === formattedTargetDate.day &&
                   formattedItemDate.month === formattedTargetDate.month &&
                   formattedItemDate.year === formattedTargetDate.year;
        }

        return true;
    };

    let currentDate = targetDate;
    let foundItem = null;

    while (!foundItem && currentDate !== '00/00/0000') {
        foundItem = dataArray.find(item => isMatch(item[columnName], currentDate, searchType));
        if (!foundItem) {
            const formattedCurrentDate = formatDate(currentDate, searchType);
            if (searchType === 'dd/mm/yyyy') {
                let { day, month, year } = formattedCurrentDate;
                if (direction === '<') {
                    day -= 1;
                    if (day === 0) {
                        // Adjust to the last day of the previous month
                        month -= 1;
                        if (month === 0) {
                            month = 12;
                            year -= 1;
                        }
                        const lastDayOfPreviousMonth = new Date(year, month, 0).getDate();
                        day = lastDayOfPreviousMonth;
                    }
                } else {
                    day += 1;
                    const lastDayOfMonth = new Date(year, month, 0).getDate();
                    if (day > lastDayOfMonth) {
                        // Adjust to the first day of the next month
                        day = 1;
                        month += 1;
                        if (month > 12) {
                            month = 1;
                            year += 1;
                        }
                    }
                }
                currentDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
            } else if (searchType === 'mm/yyyy') {
                let { month, year } = formattedCurrentDate;
                if (direction === '<') {
                    if (month === 1) {
                        month = 12;
                        year -= 1;
                    } else {
                        month -= 1;
                    }
                } else {
                    if (month === 12) {
                        month = 1;
                        year += 1;
                    } else {
                        month += 1;
                    }
                }
                currentDate = `${month.toString().padStart(2, '0')}/${year}`;
            } else {
                let { year } = formattedCurrentDate;
                if (direction === '<') {
                    year -= 1;
                } else {
                    year += 1;
                }
                currentDate = `${year}`;
            }
        }
    }
    return foundItem;
}

//=----------------------FUNÇÕES ESPECIFICAS/----------------------=//



// ALL OFFERS ____________________________________________________


async function getContent_all_offers() {
    try {
        const filePath = path.join(__dirname, 'src', 'tools', 'get_all_offers', 'data', 'data.json');
        const data = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);

        return jsonData

    } catch (error) {
        throw new Error(`Failed to read data: ${error.message}`);
    }
}

function coletarLimites_all_offers(quartil) {
    const primeiro = quartil[0];
    const ultimo = quartil[quartil.length - 1];

    return {
        startTipoTitulo: primeiro['Tipo Titulo'],
        startDataVencimento: primeiro['Data Vencimento'],
        startDataBase: primeiro['Data Base'],
        startTaxaCompraManha: primeiro['Taxa Compra Manha'],
        startTaxaVendaManha: primeiro['Taxa Venda Manha'],
        startPUCompraManha: primeiro['PU Compra Manha'],
        startPUVendaManha: primeiro['PU Venda Manha'],
        startPUBaseManha: primeiro['PU Base Manha'],
        endTipoTitulo: ultimo['Tipo Titulo'],
        endDataVencimento: ultimo['Data Vencimento'],
        endDataBase: ultimo['Data Base'],
        endTaxaCompraManha: ultimo['Taxa Compra Manha'],
        endTaxaVendaManha: ultimo['Taxa Venda Manha'],
        endPUCompraManha: ultimo['PU Compra Manha'],
        endPUVendaManha: ultimo['PU Venda Manha'],
        endPUBaseManha: ultimo['PU Base Manha']
    };
}



// ALL VNA  AND IPCA_______________________________________________________


function calcularValorAcumulado(array) {
    let acumulado = 0;

    return array.map(item => {
        acumulado += item.y; // Soma o valor atual ao acumulado
        return { ...item, y: acumulado.toFixed(2) }; // Atualiza o valor acumulado
    });
}

function combinarDadosPorMes_VNA_IPCA(array1, array2) {
    const mapa = new Map();

    // Função para adicionar dados ao mapa
    function adicionarDadosAoMapa(array, tipo) {
        array.forEach(item => {
            const [dia, mes, ano] = item.data.split('/');
            const chave = `${mes}/${ano}`;
            if (!mapa.has(chave)) {
                mapa.set(chave, { data_IPCA: '', valor_IPCA: '', data_VNA: '', valor_VNA: '' });
            }
            const dados = mapa.get(chave);
            dados[`data_${tipo}`] = item.data;
            dados[`valor_${tipo}`] = item.valor;
            mapa.set(chave, dados);
        });
    }

    // Adiciona dados de ambos os arrays ao mapa
    adicionarDadosAoMapa(array1, 'IPCA');
    adicionarDadosAoMapa(array2, 'VNA');

    // Substitui valores vazios por "SEM DADOS"
    mapa.forEach(value => {
        for (const propriedade in value) {
            if (value[propriedade] === '') {
                value[propriedade] = '-';
            }
        }
    });

    // Converte o mapa em um array
    const resultado = Array.from(mapa.values());

    return resultado;
}




// Profitability _______________________________________________________

function calculateUnitValue(valor) {
    let percentual = 1;
    let valorUnitario = (percentual / 100) * valor;

    while (valorUnitario <= 30) {
        percentual++;
        valorUnitario = (percentual / 100) * valor;
    }

    return {
        valorUnitario: valorUnitario,
        percentual: percentual
    };
}

function calcularInflacao(valorInicial, inflacaoArray) {
    let valorFinal = valorInicial;
    let inflacaoTotalPercentual = 0;

    // Extrai o valor da inflação do último item do array
    const ultimaInflacao = inflacaoArray[inflacaoArray.length - 1];
    const inflacaoPercentual = parseFloat(ultimaInflacao.y.replace(',', '.'));

    // Calcula o valor final usando o valor da inflação do último item
    valorFinal *= 1 + (inflacaoPercentual / 100);

    inflacaoTotalPercentual = inflacaoPercentual;

    const diferencaInflacao = valorFinal - valorInicial;

    return {
        valorInicial: valorInicial,
        valorFinal: valorFinal,
        inflacaoTotalPercentual: inflacaoTotalPercentual,
        diferencaInflacao: diferencaInflacao
    };
}


function calcularImposto(dataInicial, dataFinal, valorInicial, valorFinal) {
    // Convertendo as datas para objetos Date
    const dataInicio = new Date(dataInicial);
    const dataFim = new Date(dataFinal);

    // Calculando a diferença em dias entre as datas
    const diferencaDias = Math.ceil((dataFim - dataInicio) / (1000 * 60 * 60 * 24));

    // Verificando se o valor inicial é maior que o valor final
    if (valorInicial > valorFinal) {
        return "Rentabilidade Negativa";
    } else {
        // Calculando o imposto com base nos intervalos de dias
        let imposto;
        if (diferencaDias <= 180) {
            imposto = 0.225;
        } else if (diferencaDias <= 360) {
            imposto = 0.20;
        } else if (diferencaDias <= 720) {
            imposto = 0.175;
        } else {
            imposto = 0.15;
        }

        // Calculando o valor do imposto
        const valorImposto = (valorFinal - valorInicial) * imposto;
        const valorTotalComImposto = valorFinal - valorImposto;
        const percentualImposto = imposto * 100;

        return {
            "Imposto a ser pago": valorImposto.toFixed(2),
            "Valor total com imposto": valorTotalComImposto.toFixed(2),
            "Porcentagem do imposto sobre o valor total": `${percentualImposto.toFixed(2)}%`
        };
    }
}



//=----------------------ROTAS GERAIS----------------------=//

app.get('/get-list-title', async (req, res) => {
    try {

        // Contar os itens na outra tabela apenas com owner_id selecionados
        const { data: collectedData } = await supabase
            .from('selic_treasure_current')
            .select('*') // Verifica se last_code_trigger é null

        // Contar os itens na outra tabela com owner_id e codeTrigger selecionados
        // Ordenar os itens pelo nome da coluna "treasure_name"
        collectedData.sort((a, b) => {
            const nameA = a.treasure_name.toUpperCase(); // Convertendo para maiúsculas para garantir ordenação correta
            const nameB = b.treasure_name.toUpperCase();
            if (nameA < nameB) {
                return -1;
            }
            if (nameA > nameB) {
                return 1;
            }
            return 0;
        });

        res.status(200).json(collectedData);


    } catch (error) {
        console.error('Erro ao contar itens:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});






//=----------------------ROTAS ESPECIFICAS----------------------=//

app.get('/get-analytic-offers', async (req, res) => {
    try {

        const { title, period_type, period_one, period_two } = req.query;

        // Verifica se o título ou period_type foram passados ou são null
        if (!title || title == null || period_type == null || title.trim() === '' || period_type.trim() === '') {
            res.status(400).json({ message: 'Por favor, selecione um título e um tipo de período!' });
            console.log("Interrompido")
            return; // Interrompe a execução da rota
        }

        const allHistoric = await getContent_all_offers()
        const allHistoricFiltered = await filterContentsByTitle(allHistoric, title, true, "Tipo Titulo", "Data Vencimento")
        var returnData;

        if (period_type === "all") {
            returnData = allHistoricFiltered
        } else {
            returnData = filterByDateRange(allHistoricFiltered, period_one, period_two, "Data Base", "day");
        }

        const sortedHistoric = returnData.sort((a, b) => {
            const taxaCompraA = parseFloat(a['Taxa Compra Manha'].replace(',', '.')); // Converter string para número
            const taxaCompraB = parseFloat(b['Taxa Compra Manha'].replace(',', '.')); // Converter string para número
            return taxaCompraA - taxaCompraB; // Ordenar em ordem decrescente de taxa de compra
        });

        var taxaCompraArray = await getGraphicToDate(sortedHistoric, "Data Base", "Taxa Compra Manha", true)
        var puCompraArray = await getGraphicToDate(sortedHistoric, "Data Base", "PU Compra Manha", true)

        // Ordenando o array por data crescente
        taxaCompraArray = taxaCompraArray.sort((a, b) => converterParaData(a.x) - converterParaData(b.x));
        puCompraArray = puCompraArray.sort((a, b) => converterParaData(a.x) - converterParaData(b.x));

        // Loop sobre cada quartil
        const quartis = splitToQuarts(sortedHistoric.reverse()); // Supondo que sortedHistoric seja o array a ser dividido
        const quartisSelected = [];
        for (const quartil of quartis) {
            const novoObjeto = coletarLimites_all_offers(quartil);
            quartisSelected.push(novoObjeto);
        }

        res.status(200).json({ sortedHistoric, taxaCompraArray, puCompraArray, quartisSelected });

    } catch (error) {
        console.error('Erro ao contar itens:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.get('/get-analytic-VNA_and_IPCA', async (req, res) => {
    try {

        const { title, period_type, period_one, period_two } = req.query;

        // Verifica se o título ou period_type foram passados ou são null
        if (!title || title == null || period_type == null || title.trim() === '' || period_type.trim() === '') {
            res.status(400).json({ message: 'Por favor, selecione um título e um tipo de período!' });
            console.log("Interrompido")
            return; // Interrompe a execução da rota
        }

        // Contar os itens na outra tabela apenas com owner_id selecionados
        const { data: collectedData_IPCA } = await supabase
            .from('base_geral_unitaty_items')
            .select('*')
            .eq('id', 'all_IPCA')

        var data_all_IPCA = collectedData_IPCA[0].content

        // Contar os itens na outra tabela apenas com owner_id selecionados
        const { data: collectedData_VNA } = await supabase
            .from('base_geral_unitaty_items')
            .select('*')
            .eq('id', 'all_VNA')

        var data_all_VNA = collectedData_VNA[0].content



        if (period_type === "all") {
            var returnData_IPCA = data_all_IPCA
            var returnData_VNA = data_all_VNA

        } else {
            var returnData_IPCA = filterByDateRange(data_all_IPCA, period_one, period_two, "data", "day");
            var returnData_VNA = filterByDateRange(data_all_VNA, period_one, period_two, "data", "month");
        }


        var valorIPCA = await getGraphicToDate(returnData_IPCA, "data", "valor", false)
        var valorVNA = await getGraphicToDate(returnData_VNA, "data", "valor", false)

        // Ordenando o array por data crescente
        valorIPCA = valorIPCA.sort((a, b) => converterParaData(a.x) - converterParaData(b.x));
        valorVNA = valorVNA.sort((a, b) => converterParaData(a.x) - converterParaData(b.x));


        returnData_IPCA = returnData_IPCA
        returnData_VNA = returnData_VNA

        var dataTable_VNA_and_IPCA = combinarDadosPorMes_VNA_IPCA(returnData_IPCA, returnData_VNA)

        valorIPCA = calcularValorAcumulado(valorIPCA);

        dataTable_VNA_and_IPCA = dataTable_VNA_and_IPCA.sort((a, b) => {
            const dataA = new Date(a.data_IPCA);
            const dataB = new Date(b.data_IPCA);
            return dataA - dataB;
        });


        res.status(200).json({ dataTable_VNA_and_IPCA, valorIPCA, valorVNA });

    } catch (error) {
        console.error('Erro ao contar itens:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.get('/get-analytic-profitability', async (req, res) => {
    try {
        console.log('Iniciado')
        const { title, period_type, period_one, period_two, contribution_type, units } = req.query;
        //console.log(title, period_type, period_one, period_two, contribution_type, units)



        if (!title || title == null || period_type == null || title.trim() === '' || period_type.trim() === '') {
            res.status(400).json({ message: 'Por favor, selecione um título e um tipo de período!' });
            console.log("Interrompido")
            return;
        }

        const response_offers = await axios.get(`http://localhost:${port}/get-analytic-offers`, {
            params: {
                title,
                period_type,
                period_one,
                period_two
            }
        });

        const { sortedHistoric, taxaCompraArray, puCompraArray, quartisSelected } = response_offers.data;

        const tableDate_offers = sortedHistoric
        const axisArray1_offers = taxaCompraArray
        const axisArray2_offers = puCompraArray
        const quartisArray_offers = quartisSelected

        const response_VNA_and_IPCA = await axios.get(`http://localhost:${port}/get-analytic-VNA_and_IPCA`, {
            params: {
                title,
                period_type,
                period_one,
                period_two
            }
        });

        const { dataTable_VNA_and_IPCA, valorIPCA, valorVNA } = response_VNA_and_IPCA.data;


        const entry_data = findDataByTypeAndColumn(tableDate_offers, "Data Base", formatarDataParaString(period_one), "dd/mm/yyyy", ">")
        const exit_data = findDataByTypeAndColumn(tableDate_offers, "Data Base", formatarDataParaString(period_two), "dd/mm/yyyy", "<")

        const entry_VNA_data = findDataByTypeAndColumn(valorVNA, "x", formatarDataParaString(period_one), "mm/yyyy", ">")
        const exit_VNA_data = findDataByTypeAndColumn(valorVNA, "x", formatarDataParaString(period_two), "mm/yyyy", "<")

        var contribution_value_entry = parseFloat(entry_data["PU Compra Manha"].replace(',', '.'))
        var contribution_value_exit = parseFloat(exit_data["PU Compra Manha"].replace(',', '.'))


        if (contribution_type !== "entire") {
            var contribution_value_unit_entry = calculateUnitValue(contribution_value_entry)
            var contribution_value_entry = contribution_value_unit_entry.valorUnitario * parseFloat(units.replace(',', '.'))
            contribution_value_entry = contribution_value_entry.toFixed(2)

            var contribution_value_unit_exit = calculateUnitValue(contribution_value_exit)
            var contribution_value_exit = contribution_value_unit_exit.valorUnitario * parseFloat(units.replace(',', '.'))
            contribution_value_exit = contribution_value_exit.toFixed(2)

        }

        const inflation_total_value_exit = calcularInflacao(contribution_value_entry, valorIPCA)

        const tax_data = calcularImposto(period_one, period_two, contribution_value_entry, contribution_value_exit)


        if (!entry_data || !exit_data) {

            res.status(400).json({ message: 'Entrada ou Saida não encontrada!' });
            return

        }

        const entryAndExit_data = [entry_data, exit_data]
        const entryAndExit_VNA_data = [entry_VNA_data, exit_VNA_data]
        const entryAndExit_contribution_data = [contribution_value_entry, contribution_value_exit]
        const entryAndExit_inflation_data = [{ valorFinal: 0, inflacaoTotalPercentual: 0 }, inflation_total_value_exit]

        var rankTop100Melhores = tableDate_offers.reverse()
        var rankTop100Piores = tableDate_offers
        var rankGeral = tableDate_offers.reverse()

        rankTop100Melhores.slice(0, 100).forEach((item, index) => {
            item['Rank'] = index + 1;
        });

        rankTop100Piores.slice(0, 100).forEach((item, index) => {
            item['Rank'] = index + 1;
        });

        rankGeral.forEach((item, index) => {
            item['Rank'] = index + 1;
        });


        console.log(rankGeral)

        res.status(200).json({ entryAndExit_data, entryAndExit_VNA_data, entryAndExit_contribution_data, entryAndExit_inflation_data, tax_data, rankTop100Melhores, rankTop100Piores, rankGeral  });

    } catch (error) {
        console.error('Erro ao contar itens:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});







app.listen(port, () => {
    console.log(`Servidor principal rodando na porta ${port}`);
});

