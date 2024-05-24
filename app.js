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


const public = require('./public-app')
const app = express();

const port = 11111

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Verificar se o e-mail já está registrado
        const { data: existingUser } = await supabase
            .from('admin_profil')
            .select('id')
            .eq('user_email', email);

        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({ error: 'E-mail já registrado' });
        }

        // Criptografar a senha antes de armazená-la
        const hashedPassword = await bcrypt.hash(password, 10);

        // Inserir usuário no banco de dados
        const { data: newUser, error } = await supabase
            .from('dp-v2-users')
            .insert([{ user_email: email, user_password: hashedPassword }]);

        if (error) {
            throw error;
        }

        res.status(201).json({ message: 'Registro bem-sucedido' });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Obter usuário pelo e-mail
        const { data: users } = await supabase
            .from('admin_profile')
            .select('id, user_email, user_password')
            .eq('user_email', email);

        if (!users || users.length === 0) {
            return res.status(401).json({ error: 'O usuário não existe' });
        }

        //console.log(users)
        // Verificar a senha
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.user_password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Senha inválida' });
        }

        // Gerar token JWT
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
            expiresIn: '5h', // Token expira em 1 hora
        });

        res.status(200).json({ token });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.post('/get-list-tool-alert-room', async (req, res) => {
    try {
        const { jwt: token } = req.body;

        // Verificar se o token é válido
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

        // Obter usuário pelo ID do token
        const { data: user } = await supabase
            .from('admin_profile')
            .select('*')
            .eq('id', decodedToken.userId);

        if (!user || user.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        // Contar os itens na outra tabela apenas com owner_id selecionados
        const { data: collectedData } = await supabase
            .from('tool_alert_room_static')
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

app.post('/enable-or-disable-item-for-tool-alert-room', async (req, res) => {
    try {
        const { jwt: token } = req.body
        const { status, title } = req.query;

        // Verificar se o token é válido
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

        // Obter o usuário do banco de dados pelo ID do token
        const { data: userData } = await supabase
            .from('admin_profile')
            .select('*')
            .eq('id', decodedToken.userId);

        if (!userData || userData.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        console.log(status, title)
        // Atualizar o registro no banco de dados
        await supabase
            .from('tool_alert_room_static')
            .update({ actived: status }) // Use um objeto para definir a coluna a ser atualizada e seu novo valor
            .eq('treasure_name', title)

        res.status(200).json({ message: 'Configurações salvas com sucesso' });

    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});




app.listen(port, () => {
    console.log(`Servidor principal rodando na porta ${port}`);
});

