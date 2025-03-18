use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("95kZqjTgyqKUJBgW32Pp6n96ENnSSeeeJgGcGMhxXy5S");

#[program]
pub mod sol_transfer {
    use super::*;

    // Instruction to send SOL from the contract to a recipient
    pub fn send_sol(ctx: Context<SendSol>, amount: u64) -> Result<()> {
        let from = ctx.accounts.from.to_account_info();
        let to = ctx.accounts.to.to_account_info();
        let system_program = ctx.accounts.system_program.to_account_info();

        // Transfer SOL
        let transfer_instruction = Transfer {
            from: from.clone(),
            to: to.clone(),
        };
        let cpi_ctx = CpiContext::new(system_program, transfer_instruction);
        transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SendSol<'info> {
    #[account(mut)]
    pub from: Signer<'info>, // The contract's account
    #[account(mut)]
    pub to: SystemAccount<'info>, // The recipient's account
    pub system_program: Program<'info, System>,
}