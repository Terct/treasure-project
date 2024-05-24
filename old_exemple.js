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


const app = express();

const port = 22222

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());



//FUNÇÕES DO SISTEMA

async function getAllContents() {
    const { data, error } = await supabase
        .from('selic_treasure_updates')
        .select('updated_content, last_content');

    if (error) throw error;

    return data.map(item => ({
        updated_content: item.updated_content,
        last_content: item.last_content
    }));
}

function filterContentsByTitle(contents, title) {
    return contents.flatMap(item => [
        ...item.updated_content.filter(content => content.treasure_name === title),
        ...item.last_content.filter(content => content.treasure_name === title)
    ]);
}

// Função para remover duplicados com base na coluna "code_update"
function removeDuplicatesByCodeUpdate(contents) {
    const seen = new Set();
    return contents.filter(item => {
        const duplicate = seen.has(item.code_update);
        seen.add(item.code_update);
        return !duplicate;
    });
}

// Função para filtrar itens pelo intervalo de datas
function filterByDateRange(contents, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return contents.filter(item => {
        const lastUpdate = new Date(item.last_update);
        return lastUpdate >= start && lastUpdate <= end;
    });
}




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

app.get('/get-rank-taxa', async (req, res) => {
    try {

        const { title, period_type, period_one, period_two } = req.query;

        //console.log(period_one, period_two, period_type)

        const allHistoric = await getAllContents()
        const allHistoricFiltered = await filterContentsByTitle(allHistoric, title)
        const sortedHistoric = allHistoricFiltered.sort((a, b) => b.annual_profitability - a.annual_profitability);
        const uniqueHistoric = removeDuplicatesByCodeUpdate(sortedHistoric);

        //console.log(uniqueHistoric)

        if (period_type === "all") {

            res.status(200).json(uniqueHistoric);

        } else {

            const filteredByDateRange = filterByDateRange(uniqueHistoric, period_one, period_two);
            res.status(200).json(filteredByDateRange);

        }

    } catch (error) {
        console.error('Erro ao contar itens:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.post('/get-graphic-rank-taxa', async (req, res) => {
    try {
        const { data } = req.body;

        // Verifique se os dados foram recebidos corretamente
        //console.log(data);

        // Transforme o array recebido no formato desejado
        const result = data.map(item => {
            const date = new Date(item.last_update);
            const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

            return {
                x: formattedDate,
                y: item.annual_profitability
            };
        });

        // Ordene o array pelo campo x (data)
        result.sort((a, b) => {
            const [dayA, monthA, yearA] = a.x.split('/').map(Number);
            const [dayB, monthB, yearB] = b.x.split('/').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateA - dateB;
        });

        // Envie o resultado como resposta
        //console.log(result);
        res.status(200).json(result);
    } catch (error) {
        console.error('Erro ao contar itens:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});


app.listen(port, () => {
    console.log(`Servidor principal rodando na porta ${port}`);
});

